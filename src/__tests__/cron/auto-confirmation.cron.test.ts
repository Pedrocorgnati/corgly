import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findMany:   vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/services/email.service', () => ({
  emailService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/credit.service', () => ({
  creditService: {},
}))

import { prisma } from '@/lib/prisma'
import { emailService } from '@/services/email.service'
import { CronService } from '@/services/cron.service'

const cronService = new CronService()

describe('CronService.runAutoConfirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('confirma sessões IN_PROGRESS com endAt + 15min < now', async () => {
    vi.setSystemTime(new Date('2026-03-21T11:00:00Z'))

    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 2 })

    const result = await cronService.runAutoConfirmation()

    expect(result.confirmed).toBe(2)
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: ['IN_PROGRESS', 'SCHEDULED'] }),
          endAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    )
  })

  it('retorna { confirmed: 0 } quando não há sessões a confirmar', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 })

    const result = await cronService.runAutoConfirmation()

    expect(result.confirmed).toBe(0)
  })

  it('idempotente: segunda execução retorna 0 (sessões já COMPLETED não são reprocessadas)', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.session.updateMany)
      .mockResolvedValueOnce({ count: 1 }) // primeira execução
      .mockResolvedValueOnce({ count: 0 }) // segunda execução

    const r1 = await cronService.runAutoConfirmation()
    const r2 = await cronService.runAutoConfirmation()

    expect(r1.confirmed).toBe(1)
    expect(r2.confirmed).toBe(0)
  })

  it('calcula cutoff como 15 minutos atrás de now', async () => {
    const now = new Date('2026-03-21T12:00:00Z')
    vi.setSystemTime(now)

    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 })

    await cronService.runAutoConfirmation()

    const callArgs = vi.mocked(prisma.session.updateMany).mock.calls[0][0]
    const cutoff = (callArgs as { where: { endAt: { lt: Date } } }).where.endAt.lt

    const expectedCutoff = new Date(now.getTime() - 15 * 60 * 1000)
    // Cutoff deve estar ≈ 15min antes de now (tolerância de 1s)
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000)
  })

  it('envia FEEDBACK_AVAILABLE após auto-confirmação', async () => {
    vi.setSystemTime(new Date('2026-03-21T11:00:00Z'))

    vi.mocked(prisma.session.findMany).mockResolvedValue([
      {
        id: 'session-1',
        endAt: new Date('2026-03-21T10:00:00Z'),
        student: { email: 'student@test.com', name: 'Student', preferredLanguage: 'pt-BR' },
      },
    ] as never)
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 })

    await cronService.runAutoConfirmation()

    // Verifica que emailService.send foi chamado com FEEDBACK_AVAILABLE
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringMatching(/FEEDBACK_AVAILABLE/),
      }),
    )
  })

  it('não altera sessões com status CANCELLED', async () => {
    // updateMany filtra por status IN ['IN_PROGRESS', 'SCHEDULED'] — CANCELLED não entra
    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 })

    const result = await cronService.runAutoConfirmation()

    const callArgs = vi.mocked(prisma.session.updateMany).mock.calls[0][0]
    const statusFilter = (callArgs as { where: { status: { in: string[] } } }).where.status.in
    expect(statusFilter).not.toContain('CANCELLED')
    expect(result.confirmed).toBe(0)
  })
})
