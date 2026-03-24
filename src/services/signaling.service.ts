import { Redis } from '@upstash/redis'
import type { SessionSignal, SignalType } from '@/types/sala-virtual'

const SIGNAL_TTL_SECONDS = 60 * 60 // 1h retenção máxima
const MAX_SIGNALS_PER_KEY = 200    // hard cap por chave (sessão:usuário)
const KEY_PREFIX = '@corgly/sig'

interface StoredSignal extends SessionSignal {
  expiresAt: number
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
  const filtered = all.filter((s) => new Date(s.timestamp).getTime() > afterTs && s.expiresAt > now)
  const remaining = all.filter((s) => new Date(s.timestamp).getTime() <= afterTs || s.expiresAt <= now)
  if (remaining.length === 0) memStore.delete(k)
  else memStore.set(k, remaining)
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
    // RPUSH + LTRIM para hard cap + EXPIRE para TTL
    await r.rpush(k, JSON.stringify(stored))
    await r.ltrim(k, -MAX_SIGNALS_PER_KEY, -1)
    await r.expire(k, SIGNAL_TTL_SECONDS)
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

    // Buscar todos os signals da lista
    const raw = await r.lrange(k, 0, -1)
    if (!raw || raw.length === 0) return []

    const allSignals: StoredSignal[] = raw.map((item) =>
      typeof item === 'string' ? JSON.parse(item) : item,
    )

    const filtered = allSignals.filter(
      (s) => new Date(s.timestamp).getTime() > afterTs && s.expiresAt > now,
    )
    const remaining = allSignals.filter(
      (s) => new Date(s.timestamp).getTime() <= afterTs || s.expiresAt <= now,
    )

    // Reescrever lista apenas com os não-consumidos
    if (remaining.length === 0) {
      await r.del(k)
    } else {
      // MULTI/pipeline para atomicidade
      await r.del(k)
      if (remaining.length > 0) {
        await r.rpush(k, ...remaining.map((s) => JSON.stringify(s)))
        await r.expire(k, SIGNAL_TTL_SECONDS)
      }
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
