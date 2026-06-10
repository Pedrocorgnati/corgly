'use client'

import { apiClient } from '@/lib/api-client'
import { API } from '@/lib/constants/routes'
import { UserRole } from '@/lib/constants/enums'

/**
 * Cliente best-effort de health da sessão (T-027, ST-47/ST-48).
 *
 * As telas de fallback (`audio-only`, `reconnecting`) precisam registrar um
 * evento de health a CADA transição de estado, sem nunca bloquear a experiência:
 * se a telemetria falhar, a aula continua viável. Por isso `recordHealthTransition`
 * NUNCA lança — retorna um boolean e deixa o caller decidir o feedback visível
 * (Zero Silencio: a tela mostra um aviso discreto; Zero Fluxos Incompletos: o
 * caminho de erro é tratado, não engolido).
 *
 * O endpoint POST /api/v1/sessions/:id/health-events injeta o `sessionId`
 * autoritativo a partir do path; o corpo apenas espelha o id para o schema Zod.
 */

export type HealthTransitionEventType =
  | 'CONNECTION_STATE'
  | 'RECONNECT_ATTEMPT'
  | 'RECONNECT_SUCCESS'
  | 'RECONNECT_FAILED'

export type HealthWebRtcState =
  | 'NEW'
  | 'CHECKING'
  | 'CONNECTED'
  | 'COMPLETED'
  | 'DISCONNECTED'
  | 'FAILED'
  | 'CLOSED'

export interface RecordHealthTransitionInput {
  sessionId: string
  /** Papel do participante autenticado (deriva STUDENT/ADMIN). */
  role: UserRole | null
  eventType: HealthTransitionEventType
  webrtcState: HealthWebRtcState
  /** Obrigatório >= 1 para eventos RECONNECT_* (validado pelo schema do servidor). */
  reconnectAttempt?: number
  reconnectReason?: string
  metadata?: Record<string, unknown>
}

/**
 * A plataforma é single-tutor: professor e suporte colapsam em ADMIN, espelhando
 * `session-health.service`. Qualquer papel não-ADMIN é tratado como STUDENT.
 */
function toParticipantRole(role: UserRole | null): 'STUDENT' | 'ADMIN' {
  return role === UserRole.ADMIN ? 'ADMIN' : 'STUDENT'
}

export async function recordHealthTransition(
  input: RecordHealthTransitionInput,
): Promise<boolean> {
  const event: Record<string, unknown> = {
    sessionId: input.sessionId,
    participantRole: toParticipantRole(input.role),
    eventType: input.eventType,
    webrtcState: input.webrtcState,
    occurredAt: new Date().toISOString(),
  }

  if (input.reconnectAttempt !== undefined) {
    event.reconnectAttempt = input.reconnectAttempt
  }
  if (input.reconnectReason) {
    event.reconnectReason = input.reconnectReason
  }
  if (input.metadata) {
    event.metadata = input.metadata
  }

  try {
    await apiClient.post(API.SESSION_HEALTH_EVENTS(input.sessionId), {
      events: [event],
    })
    return true
  } catch (err) {
    console.warn('[session-health.client] Falha ao registrar transição de health:', err)
    return false
  }
}

/** Janela canônica de reconexão (2 minutos), espelha `useReconnect`. */
export const RECONNECT_WINDOW_SECONDS = 120

export function formatReconnectCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
