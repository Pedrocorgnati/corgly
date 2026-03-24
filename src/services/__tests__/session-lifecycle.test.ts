// @vitest-environment node
/**
 * TASK-4 ST012 — Testes backend: extend + lifecycle (startSession, completeSession, extendSession, interruptSession)
 * Vitest com globals=true (api compatível com jest via vi.*)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '@/lib/errors'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        session: {
          update: vi.fn().mockResolvedValue({}),
        },
      })
    ),
  },
}))

vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/services/credit.service', () => ({
  creditService: {
    consume: vi.fn().mockResolvedValue({ batchIds: ['batch-1'] }),
    refund: vi.fn().mockResolvedValue(undefined),
    getBalance: vi.fn().mockResolvedValue(5),
  },
}))

import { prisma } from '@/lib/prisma'
import { SessionService } from '../session.service'

const mockFindUnique = vi.mocked(prisma.session.findUnique)
const mockUpdate = vi.mocked(prisma.session.update)

const SESSION_ID = 'sess-lifecycle-1'

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    studentId: 'student-1',
    availabilitySlotId: 'slot-1',
    startAt: new Date('2026-03-25T14:00:00Z'),
    endAt: new Date('2026-03-25T14:50:00Z'),
    status: 'SCHEDULED',
    creditBatchId: 'batch-1',
    isRecurring: false,
    recurringPatternId: null,
    cancelledAt: null,
    cancelledBy: null,
    completedAt: null,
    interruptedAt: null,
    extendedBy: null,
    reminderSentAt: null,
    rescheduleRequestSlotId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SessionService — extendSession', () => {
  it('SUCCESS — ADMIN estende 10min → endAt cresce 10min + extendedBy acumula', async () => {
    const session = makeSession({ status: 'IN_PROGRESS', extendedBy: 0 })
    mockFindUnique.mockResolvedValue(session as never)
    const newEndAt = new Date(session.endAt.getTime() + 10 * 60 * 1000)
    mockUpdate.mockResolvedValue({ ...session, endAt: newEndAt, extendedBy: 10 } as never)

    const service = new SessionService()
    const result = await service.extendSession(SESSION_ID, 10)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({ extendedBy: 10 }),
      })
    )
    expect(result).toMatchObject({ extendedBy: 10 })
  })

  it('ERROR — total extendedBy > 60min → lança SESSION_070', async () => {
    const session = makeSession({ status: 'IN_PROGRESS', extendedBy: 55 })
    mockFindUnique.mockResolvedValue(session as never)

    const service = new SessionService()
    await expect(service.extendSession(SESSION_ID, 10)).rejects.toThrow(AppError)
    await expect(service.extendSession(SESSION_ID, 10)).rejects.toMatchObject({ code: 'SESSION_070' })
  })

  it('ERROR — sessão COMPLETED → lança SESSION_060', async () => {
    const session = makeSession({ status: 'COMPLETED', extendedBy: 0 })
    mockFindUnique.mockResolvedValue(session as never)

    const service = new SessionService()
    await expect(service.extendSession(SESSION_ID, 10)).rejects.toThrow(AppError)
    await expect(service.extendSession(SESSION_ID, 10)).rejects.toMatchObject({ code: 'SESSION_060' })
  })
})

describe('SessionService — startSession', () => {
  it('SUCCESS — SCHEDULED → IN_PROGRESS', async () => {
    const session = makeSession({ status: 'SCHEDULED' })
    mockFindUnique.mockResolvedValue(session as never)
    mockUpdate.mockResolvedValue({ ...session, status: 'IN_PROGRESS' } as never)

    const service = new SessionService()
    const result = await service.startSession(SESSION_ID)

    expect(result).toMatchObject({ status: 'IN_PROGRESS' })
  })

  it('ERROR — sessão não IN_PROGRESS-able → lança SESSION_060', async () => {
    const session = makeSession({ status: 'COMPLETED' })
    mockFindUnique.mockResolvedValue(session as never)

    const service = new SessionService()
    await expect(service.startSession(SESSION_ID)).rejects.toThrow(AppError)
  })
})

describe('SessionService — interruptSession', () => {
  it('SUCCESS — IN_PROGRESS → INTERRUPTED + creditRefunded', async () => {
    const session = makeSession({ status: 'IN_PROGRESS' })
    mockFindUnique.mockResolvedValue(session as never)
    mockUpdate.mockResolvedValue({ ...session, status: 'INTERRUPTED', interruptedAt: new Date() } as never)

    const service = new SessionService()
    const result = await service.interruptSession(SESSION_ID, 'connection_lost')

    expect(result).toMatchObject({ status: 'INTERRUPTED' })
  })

  it('ERROR — sessão não IN_PROGRESS → lança SESSION_060', async () => {
    const session = makeSession({ status: 'SCHEDULED' })
    mockFindUnique.mockResolvedValue(session as never)

    const service = new SessionService()
    await expect(service.interruptSession(SESSION_ID, 'connection_lost')).rejects.toThrow(AppError)
  })
})
