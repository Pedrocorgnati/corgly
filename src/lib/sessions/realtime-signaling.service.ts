/**
 * Realtime signaling adapter — Fase 1 do ADR-0002.
 *
 * Implementa a decisão arquitetônica registrada em
 * `output/docs/corgly/project/adrs/ADR-0002-realtime-signaling.md`:
 *
 *   "Opção 3 — WebSocket dedicado `WS /realtime/sessions/{id}` reusando a
 *    infraestrutura Hocuspocus, com HTTP poll como fallback automático."
 *
 * Esta é a Fase 1 do plano de migração: o adapter de transporte com uma
 * interface única (`SignalingTransport`) e duas implementações conceituais
 * (`ws`, `poll`). O WebSocket fica DESLIGADO por feature flag (default off) e o
 * HTTP poll continua sendo o transporte default em produção. O caminho poll
 * existente (`/api/v1/sessions/:id/signal` + `signalingService`) NÃO é removido
 * nem alterado — este serviço delega a ele, preservando o fallback como rede de
 * segurança (seção "Fallback" do ADR).
 *
 * Escopo honesto (seção "Paridade" do ADR): no modo poll-fallback somente o
 * signaling WebRTC é transportado; presença, lobby, chat in-call e health-events
 * permanecem WS-only e são escopo das Fases 2/3.
 */
import { prisma } from '@/lib/prisma'
import { signalingService } from '@/services/signaling.service'
import type { SessionSignal } from '@/types/sala-virtual'
import { SessionStatus, UserRole } from '@/lib/constants/enums'

// ── Feature flag (default OFF → poll é o transporte primário) ───────────────────

/**
 * Liga o transporte WebSocket primário. Default `false`: em produção o poll
 * continua sendo o default até a Fase 2 do plano de migração do ADR-0002.
 * Lido direto de `process.env` (mesmo padrão de `signaling.service.ts`) para não
 * acoplar a Fase 1 ao schema estrito de `@/lib/env`.
 */
export function isRealtimeWsEnabled(): boolean {
  return process.env.REALTIME_WS_ENABLED === 'true'
}

// ── Transporte ──────────────────────────────────────────────────────────────────

export type RealtimeTransportKind = 'ws' | 'poll'

/**
 * Descritor de negociação devolvido ao cliente. Diz qual transporte usar e como
 * configurá-lo. Em Fase 1 (flag off) descreve sempre o caminho poll existente.
 */
export interface TransportDescriptor {
  /** Transporte primário recomendado para esta sessão. */
  transport: RealtimeTransportKind
  /** Endpoint WS quando `transport === 'ws'` (vazio quando poll). */
  wsUrl: string | null
  /** Endpoint poll de fallback — sempre presente (rede de segurança). */
  pollUrl: string
  /** Intervalo de heartbeat ping/pong em ms (ADR: 25s). */
  heartbeatMs: number
  /** Backoff de reconexão em ms (ADR: 1s, 2s, 4s, máx 30s). */
  reconnectBackoffMs: number[]
  /** Após quantas falhas de handshake WS o cliente degrada para poll (ADR: 3). */
  fallbackAfterFailures: number
}

/**
 * Interface única de transporte de signaling — o ponto fixado pela Fase 1 do
 * ADR-0002. As implementações de cliente (`WsTransport`, `PollTransport`) honram
 * este contrato; trocar o transporte primário é flipar a flag, sem reescrever a
 * lógica de SDP/ICE da camada acima. Definida aqui como contrato compartilhado
 * entre o hook de cliente e a camada de negociação.
 */
export interface SignalingTransport {
  readonly kind: RealtimeTransportKind
  connect(sessionId: string): Promise<void>
  send(message: Omit<SessionSignal, 'from'>): Promise<void>
  subscribe(handler: (message: SessionSignal) => void): () => void
  disconnect(): void
}

// ── Autorização (participante + sessão ativa) ──────────────────────────────────

const ACTIVE_STATUSES: SessionStatus[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
]

export type AuthorizationResult =
  | {
      ok: true
      /** Mailbox do próprio caller (de onde ele consome). */
      ownMailbox: string
      /** Mailbox do peer (para onde o caller publica). */
      peerMailbox: string
    }
  | { ok: false; status: 403 | 404 | 409; reason: string }

/**
 * Identidade de mailbox de um participante:
 *   - ADMIN/professor  → `'admin-peer'`
 *   - aluno            → o próprio `userId` (== `studentId`)
 * Convenção espelhada do caminho poll existente para que ambos os transportes
 * operem sobre as mesmas caixas de mensagem.
 */
function mailboxOf(role: string, userId: string): string {
  return role === UserRole.ADMIN ? 'admin-peer' : userId
}

/**
 * Autoriza um caller para signaling realtime: precisa ser participante da sessão
 * (aluno dono ou ADMIN) E a sessão precisa estar em status ativo
 * (SCHEDULED | IN_PROGRESS). Resolve as mailboxes own/peer para roteamento.
 */
export async function authorizeRealtime(
  sessionId: string,
  userId: string,
  role: string,
): Promise<AuthorizationResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  })

  if (!session) {
    return { ok: false, status: 404, reason: 'Sessão não encontrada.' }
  }

  const isParticipant = role === UserRole.ADMIN || session.studentId === userId
  if (!isParticipant) {
    return {
      ok: false,
      status: 403,
      reason: 'Acesso negado: não é participante da sessão.',
    }
  }

  if (!ACTIVE_STATUSES.includes(session.status as SessionStatus)) {
    return {
      ok: false,
      status: 409,
      reason: 'Sessão não está ativa para sinalização.',
    }
  }

  const ownMailbox = mailboxOf(role, userId)
  // O peer é a outra identidade da sessão.
  const peerMailbox = ownMailbox === 'admin-peer' ? session.studentId : 'admin-peer'

  return { ok: true, ownMailbox, peerMailbox }
}

// ── Serviço de adapter ──────────────────────────────────────────────────────────

export type PublishResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409; reason: string }

export type ConsumeResult =
  | { ok: true; messages: SessionSignal[] }
  | { ok: false; status: 403 | 404 | 409; reason: string }

/**
 * Adapter de signaling realtime. Em Fase 1 roteia sobre o backbone poll
 * (`signalingService`), preservando o fallback. A interface server-side
 * (`negotiate` / `publish` / `consume`) é estável: ligar o `WsTransport` na
 * Fase 2 não muda esta assinatura.
 */
export class RealtimeSignalingService {
  /** Negocia o transporte para uma sessão (Fase 1: sempre descreve poll quando flag off). */
  negotiate(sessionId: string): TransportDescriptor {
    const wsEnabled = isRealtimeWsEnabled()
    const wsBase = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? ''
    return {
      transport: wsEnabled ? 'ws' : 'poll',
      wsUrl: wsEnabled && wsBase ? `${wsBase.replace(/\/$/, '')}/realtime/sessions/${sessionId}` : null,
      pollUrl: `/api/v1/sessions/${sessionId}/signal`,
      heartbeatMs: 25_000,
      reconnectBackoffMs: [1_000, 2_000, 4_000, 8_000, 16_000, 30_000],
      fallbackAfterFailures: 3,
    }
  }

  /**
   * Publica uma mensagem de signaling autorizada por participante + sessão ativa.
   * Armazena na mailbox do peer (caixa de quem vai receber), via backbone poll.
   */
  async publish(
    sessionId: string,
    userId: string,
    role: string,
    message: Omit<SessionSignal, 'from'>,
  ): Promise<PublishResult> {
    const auth = await authorizeRealtime(sessionId, userId, role)
    if (!auth.ok) return auth

    const signal: SessionSignal = {
      type: message.type,
      payload: message.payload,
      from: userId,
      timestamp: message.timestamp ?? new Date().toISOString(),
    }

    await signalingService.storeSignal(sessionId, auth.peerMailbox, signal)
    return { ok: true }
  }

  /**
   * Consome (e remove) as mensagens pendentes endereçadas ao caller, autorizado
   * por participante + sessão ativa. Lê da mailbox do próprio caller.
   */
  async consume(
    sessionId: string,
    userId: string,
    role: string,
    after?: string,
  ): Promise<ConsumeResult> {
    const auth = await authorizeRealtime(sessionId, userId, role)
    if (!auth.ok) return auth

    const messages = await signalingService.getSignals(
      sessionId,
      userId,
      auth.ownMailbox,
      after,
    )
    return { ok: true, messages }
  }
}

export const realtimeSignalingService = new RealtimeSignalingService()
