/**
 * T-022 (item 023) — Realtime signaling adapter (Fase 1 do ADR-0002).
 *
 * Cobre os três eixos da Acceptance da task:
 *   1. Envio   (participante publica e a mensagem é roteada para o peer)
 *   2. Recebimento (peer consome a mensagem endereçada a ele)
 *   3. Rejeição por não-participante (publish e consume negados com 403)
 *
 * Autorização (participante + sessão ativa) é validada via mock do Prisma.
 * O transporte usa o backbone poll in-memory (sem Redis no ambiente de teste).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  RealtimeSignalingService,
  authorizeRealtime,
} from '@/lib/sessions/realtime-signaling.service'
import { SessionStatus, UserRole } from '@/lib/constants/enums'

const STUDENT_ID = 'student-001'
const mockOffer: RTCSdpInit = { type: 'offer', sdp: 'v=0\r\no=student...' }
const mockAnswer: RTCSdpInit = { type: 'answer', sdp: 'v=0\r\na=admin...' }

function activeSession() {
  vi.mocked(prisma.session.findUnique).mockResolvedValue({
    studentId: STUDENT_ID,
    status: SessionStatus.IN_PROGRESS,
  } as never)
}

describe('RealtimeSignalingService — adapter Fase 1 (ADR-0002)', () => {
  let service: RealtimeSignalingService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RealtimeSignalingService()
  })

  it('negotiate descreve poll como default (flag WS off)', () => {
    const prev = process.env.REALTIME_WS_ENABLED
    delete process.env.REALTIME_WS_ENABLED
    const d = service.negotiate('session-neg-1')
    expect(d.transport).toBe('poll')
    expect(d.wsUrl).toBeNull()
    expect(d.pollUrl).toBe('/api/v1/sessions/session-neg-1/signal')
    expect(d.fallbackAfterFailures).toBe(3)
    if (prev !== undefined) process.env.REALTIME_WS_ENABLED = prev
  })

  it('envio + recebimento: aluno publica offer e ADMIN recebe', async () => {
    activeSession()
    const sessionId = 'session-send-recv-1'

    // 1. Envio: aluno (participante) publica uma offer.
    const pub = await service.publish(sessionId, STUDENT_ID, UserRole.STUDENT, {
      type: 'offer',
      payload: mockOffer,
      timestamp: new Date().toISOString(),
    })
    expect(pub.ok).toBe(true)

    // 2. Recebimento: ADMIN (peer) consome e recebe a offer do aluno.
    const recv = await service.consume(sessionId, 'admin-user-id', UserRole.ADMIN)
    expect(recv.ok).toBe(true)
    if (recv.ok) {
      expect(recv.messages).toHaveLength(1)
      expect(recv.messages[0]).toMatchObject({
        type: 'offer',
        from: STUDENT_ID,
        payload: mockOffer,
      })
    }
  })

  it('envio + recebimento no sentido inverso: ADMIN publica answer e aluno recebe', async () => {
    activeSession()
    const sessionId = 'session-send-recv-2'

    const pub = await service.publish(sessionId, 'admin-user-id', UserRole.ADMIN, {
      type: 'answer',
      payload: mockAnswer,
      timestamp: new Date().toISOString(),
    })
    expect(pub.ok).toBe(true)

    const recv = await service.consume(sessionId, STUDENT_ID, UserRole.STUDENT)
    expect(recv.ok).toBe(true)
    if (recv.ok) {
      expect(recv.messages).toHaveLength(1)
      expect(recv.messages[0]).toMatchObject({ type: 'answer', payload: mockAnswer })
    }
  })

  it('rejeição: não-participante NÃO consegue publicar (403)', async () => {
    activeSession()
    const res = await service.publish('session-reject-1', 'intruder-999', UserRole.STUDENT, {
      type: 'offer',
      payload: mockOffer,
      timestamp: new Date().toISOString(),
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(403)
  })

  it('rejeição: não-participante NÃO consegue consumir (403)', async () => {
    activeSession()
    const res = await service.consume('session-reject-2', 'intruder-999', UserRole.STUDENT)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(403)
  })

  it('mensagem de não-participante nunca chega ao peer (isolamento)', async () => {
    activeSession()
    const sessionId = 'session-isolation-1'

    // Intruso tenta publicar — rejeitado.
    const intrusion = await service.publish(sessionId, 'intruder-999', UserRole.STUDENT, {
      type: 'offer',
      payload: mockOffer,
      timestamp: new Date().toISOString(),
    })
    expect(intrusion.ok).toBe(false)

    // ADMIN consome — nenhuma mensagem do intruso vazou.
    const recv = await service.consume(sessionId, 'admin-user-id', UserRole.ADMIN)
    expect(recv.ok).toBe(true)
    if (recv.ok) expect(recv.messages).toHaveLength(0)
  })

  it('sessão inexistente → 404; sessão inativa → 409 (estados definidos)', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null as never)
    const notFound = await authorizeRealtime('nope', STUDENT_ID, UserRole.STUDENT)
    expect(notFound.ok).toBe(false)
    if (!notFound.ok) expect(notFound.status).toBe(404)

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      studentId: STUDENT_ID,
      status: SessionStatus.COMPLETED,
    } as never)
    const inactive = await authorizeRealtime('done-session', STUDENT_ID, UserRole.STUDENT)
    expect(inactive.ok).toBe(false)
    if (!inactive.ok) expect(inactive.status).toBe(409)
  })
})
