/**
 * TASK-9 ST002 — Integration test: interrupt idempotency
 * Testa que double PATCH interrupt resulta em single refund.
 * Mock de prisma e creditService para isolamento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockRefund = vi.fn().mockResolvedValue(undefined)
const mockTransaction = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<void>) => mockTransaction(fn),
  },
}))

vi.mock('@/services/credit.service', () => ({
  creditService: {
    refund: (...args: unknown[]) => mockRefund(...args),
  },
}))

// Import after mocks
const { sessionService } = await import('@/services/session.service')

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Interrupt Idempotency', () => {
  const SESSION_ID = 'session-int-001'
  const STUDENT_ID = 'student-001'
  const BATCH_ID = 'batch-001'

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({})
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const txProxy = {
        session: {
          update: mockUpdate,
        },
      }
      return fn(txProxy)
    })
  })

  it('primeiro interrupt em sessão IN_PROGRESS → sucesso com refund', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: null,
    })

    const result = await sessionService.interruptSession(SESSION_ID, 'connection_lost')

    expect(result).toEqual({ status: 'INTERRUPTED', creditRefunded: true })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockRefund).toHaveBeenCalledTimes(1)
    expect(mockRefund).toHaveBeenCalledWith(STUDENT_ID, 1, BATCH_ID)
  })

  it('segundo interrupt em sessão já INTERRUPTED → retorna sem refund adicional', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'INTERRUPTED',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: new Date(),
    })

    const result = await sessionService.interruptSession(SESSION_ID, 'connection_lost')

    expect(result).toEqual({ status: 'INTERRUPTED', creditRefunded: false })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRefund).not.toHaveBeenCalled()
  })

  it('2x PATCH interrupt sequencial → single refund (idempotente)', async () => {
    // Primeira chamada: IN_PROGRESS
    mockFindUnique.mockResolvedValueOnce({
      status: 'IN_PROGRESS',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: null,
    })

    await sessionService.interruptSession(SESSION_ID, 'connection_lost')

    // Segunda chamada: já INTERRUPTED (estado persistido)
    mockFindUnique.mockResolvedValueOnce({
      status: 'INTERRUPTED',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: new Date(),
    })

    await sessionService.interruptSession(SESSION_ID, 'connection_lost')

    // Refund chamado apenas 1x
    expect(mockRefund).toHaveBeenCalledTimes(1)
  })

  it('interrupt em sessão COMPLETED → throws SESSION_060', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'COMPLETED',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: null,
    })

    await expect(
      sessionService.interruptSession(SESSION_ID, 'connection_lost'),
    ).rejects.toMatchObject({ code: 'SESSION_060' })

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRefund).not.toHaveBeenCalled()
  })

  it('interrupt com reason diferente no segundo call → mesmo resultado idempotente', async () => {
    // Primeira: connection_lost em IN_PROGRESS
    mockFindUnique.mockResolvedValueOnce({
      status: 'IN_PROGRESS',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: null,
    })

    await sessionService.interruptSession(SESSION_ID, 'connection_lost')

    // Segunda: teacher_ended mas já INTERRUPTED
    mockFindUnique.mockResolvedValueOnce({
      status: 'INTERRUPTED',
      studentId: STUDENT_ID,
      creditBatchId: BATCH_ID,
      interruptedAt: new Date(),
    })

    const result = await sessionService.interruptSession(SESSION_ID, 'teacher_ended')

    expect(result).toEqual({ status: 'INTERRUPTED', creditRefunded: false })
    expect(mockRefund).toHaveBeenCalledTimes(1)
  })
})
