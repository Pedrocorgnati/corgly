import { Redis } from '@upstash/redis'
import type { SessionSignal } from '@/types/sala-virtual'

const SIGNAL_TTL_SECONDS = 60 * 60 // 1h retenção máxima
const MAX_SIGNALS_PER_KEY = 200    // hard cap por chave (sessão:usuário)
const KEY_PREFIX = '@corgly/sig'

interface StoredSignal extends SessionSignal {
  expiresAt: number
}

function signalTs(signal: StoredSignal): number {
  return new Date(signal.timestamp).getTime()
}

/**
 * O cliente REST do Upstash desserializa a resposta quando reconhece JSON, entao
 * o item da lista chega ora como string ora como objeto ja pronto.
 */
function parseStoredSignal(item: string | StoredSignal): StoredSignal {
  return typeof item === 'string' ? (JSON.parse(item) as StoredSignal) : item
}

// ---------------------------------------------------------------------------
// Redis client — lazy, fallback in-memory se não configurado
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null
let redisChecked = false

function getRedis(): Redis | null {
  if (redisChecked) return redisClient
  redisChecked = true

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[signaling] UPSTASH_REDIS_REST_URL/TOKEN não configurados — ' +
        'signaling service usando fallback in-memory (não funciona com múltiplas instâncias).',
      )
    }
    return null
  }

  redisClient = new Redis({ url, token })
  return redisClient
}

// ---------------------------------------------------------------------------
// Fallback in-memory (dev / Redis não configurado)
// ---------------------------------------------------------------------------

const memStore = new Map<string, StoredSignal[]>()

function memStoreSignal(k: string, signal: StoredSignal): void {
  const arr = memStore.get(k) ?? []
  arr.push(signal)
  const capped = arr.length > MAX_SIGNALS_PER_KEY ? arr.slice(-MAX_SIGNALS_PER_KEY) : arr
  memStore.set(k, capped)
}

function memGetSignals(k: string, afterTs: number): SessionSignal[] {
  const all = memStore.get(k) ?? []
  const now = Date.now()
  const filtered = all.filter((s) => signalTs(s) > afterTs && s.expiresAt > now)
  // Retidos: os que o cliente ainda nao pediu (timestamp <= after) E continuam
  // validos. Expirado nao volta para a fila — antes ele era reescrito a cada
  // poll e sobrevivia para sempre.
  const retained = all.filter((s) => signalTs(s) <= afterTs && s.expiresAt > now)
  if (retained.length === 0) memStore.delete(k)
  else memStore.set(k, retained)
  return filtered.map(({ expiresAt: _e, ...signal }) => signal)
}

function memClearSignals(sessionId: string): void {
  for (const key of memStore.keys()) {
    if (key.startsWith(`${sessionId}:`)) memStore.delete(key)
  }
}

// ---------------------------------------------------------------------------
// SignalingService — Redis-backed com fallback in-memory
// ---------------------------------------------------------------------------

/**
 * Signaling service distribuído para WebRTC.
 * Armazena offer/answer/ICE candidates em Redis (Upstash) por sessão.
 * Funciona em múltiplas instâncias Vercel.
 * Fallback in-memory quando UPSTASH_REDIS_REST_URL não configurado (dev).
 */
export class SignalingService {
  private redisKey(sessionId: string, fromUserId: string): string {
    return `${KEY_PREFIX}:${sessionId}:${fromUserId}`
  }

  /**
   * Armazena um signal enviado por um participante.
   */
  async storeSignal(sessionId: string, userId: string, signal: SessionSignal): Promise<void> {
    const r = getRedis()
    const stored: StoredSignal = { ...signal, expiresAt: Date.now() + SIGNAL_TTL_SECONDS * 1000 }

    if (!r) {
      memStoreSignal(`${sessionId}:${userId}`, stored)
      return
    }

    const k = this.redisKey(sessionId, userId)
    // MULTI/EXEC de verdade: RPUSH + LTRIM (hard cap) + EXPIRE (TTL) viram uma
    // transacao so. Em tres chamadas soltas, uma falha no meio deixava a fila
    // sem cap ou a chave sem TTL — e custava tres round-trips HTTP no caminho
    // quente do handshake.
    await r.multi()
      .rpush(k, JSON.stringify(stored))
      .ltrim(k, -MAX_SIGNALS_PER_KEY, -1)
      .expire(k, SIGNAL_TTL_SECONDS)
      .exec()
  }

  /**
   * Retorna signals pendentes enviados pelo peer para este usuário.
   * Signals com timestamp <= after são descartados.
   * Signals expirados (expiresAt) são descartados.
   * Os signals retornados são removidos da fila (consume).
   */
  async getSignals(
    sessionId: string,
    forUserId: string,
    peerUserId: string,
    after?: string,
  ): Promise<SessionSignal[]> {
    const afterTs = after ? new Date(after).getTime() : 0
    const r = getRedis()

    if (!r) {
      return memGetSignals(`${sessionId}:${peerUserId}`, afterTs)
    }

    const k = this.redisKey(sessionId, peerUserId)
    const now = Date.now()

    // LPOP com count drena a fila inteira numa unica operacao atomica. O par
    // LRANGE + DEL que existia aqui apagava tambem o que o peer tivesse
    // publicado entre a leitura e a escrita: um ICE candidate perdido assim nao
    // reaparece em poll nenhum e a conexao simplesmente nao fecha.
    const raw = await r.lpop<(string | StoredSignal)[]>(k, MAX_SIGNALS_PER_KEY)
    if (!raw || raw.length === 0) return []

    const allSignals: StoredSignal[] = raw.map(parseStoredSignal)

    const filtered = allSignals.filter((s) => signalTs(s) > afterTs && s.expiresAt > now)
    // Retidos: os que o cliente ainda nao pediu (timestamp <= after) E continuam
    // validos. Expirado nao volta para a fila — antes ele era reescrito com
    // EXPIRE renovado a cada poll e a chave nunca morria.
    const retained = allSignals.filter((s) => signalTs(s) <= afterTs && s.expiresAt > now)

    if (retained.length > 0) {
      // LPUSH em ordem reversa recoloca os retidos na cabeca preservando a ordem
      // cronologica e deixando na cauda o que chegou durante o consumo.
      const payload = retained.map((s) => JSON.stringify(s)).reverse()
      await r.multi().lpush(k, ...payload).expire(k, SIGNAL_TTL_SECONDS).exec()
    }

    return filtered.map(({ expiresAt: _e, ...signal }) => signal)
  }

  /**
   * Limpa todos os signals de uma sessão (chamar após COMPLETED/INTERRUPTED).
   */
  async clearSignals(sessionId: string): Promise<void> {
    const r = getRedis()

    if (!r) {
      memClearSignals(sessionId)
      return
    }

    // Deletar keys de ambos os participantes possíveis
    // (student → 'admin-peer'; admin → studentId)
    // Usamos SCAN para encontrar todas as keys da sessão
    let cursor = 0
    do {
      const [nextCursor, keys] = await r.scan(cursor, {
        match: `${KEY_PREFIX}:${sessionId}:*`,
        count: 100,
      })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await r.del(...keys)
      }
    } while (cursor !== 0)
  }
}

export const signalingService = new SignalingService()
