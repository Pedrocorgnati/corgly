import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock do Prisma e EmailService antes de importar o CronService
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    creditBatch: {
      update: vi.fn(),
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
import { EmailType } from '@/types/enums'

const cronService = new CronService()

describe('CronService.runCreditExpiration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna resultado com contagens zeradas quando não há batches a processar', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])

    const result = await cronService.runCreditExpiration()

    expect(result).toHaveProperty('notifiedExpiring7d')
    expect(result).toHaveProperty('notifiedExpiring30d')
    expect(result.notifiedExpiring7d).toBe(0)
    expect(result.notifiedExpiring30d).toBe(0)
  })

  it('envia email CREDIT_EXPIRY_WARNING para batch expirando em ≤7 dias', async () => {
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    const batch = {
      id: 'batch-1',
      userId: 'user-1',
      totalCredits: 5,
      usedCredits: 2,
      expiresAt: new Date('2026-03-25T00:00:00Z'), // 5 dias
      lastExpiryEmailSent: null,
      email: 'user@test.com',
      name: 'Test User',
      preferredLanguage: 'PT_BR',
    }

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([batch]) // expiring7d
      .mockResolvedValueOnce([]) // expiring30d
      .mockResolvedValueOnce([]) // expiredWithBalance

    vi.mocked(prisma.creditBatch.update).mockResolvedValue({} as never)

    await cronService.runCreditExpiration()

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EmailType.CREDIT_EXPIRY_WARNING,
        to: 'user@test.com',
      }),
    )
  })

  it('não envia email duplicado se já enviou hoje (idempotência via lastExpiryEmailSent)', async () => {
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))

    const batch = {
      id: 'batch-1',
      userId: 'user-1',
      totalCredits: 5,
      usedCredits: 2,
      expiresAt: new Date('2026-03-25T00:00:00Z'),
      lastExpiryEmailSent: new Date('2026-03-20T08:00:00Z'), // já enviou hoje
      email: 'user@test.com',
      name: 'Test User',
      preferredLanguage: 'PT_BR',
    }

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([batch])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await cronService.runCreditExpiration()

    expect(emailService.send).not.toHaveBeenCalled()
  })

  it('não expira batch com expiresAt no futuro', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([]) // nenhum batch expirando em 7d
      .mockResolvedValueOnce([]) // nenhum batch expirando em 30d
      .mockResolvedValueOnce([]) // nenhum batch expirado com saldo

    const result = await cronService.runCreditExpiration()

    expect(result.notifiedExpiring7d).toBe(0)
    expect(result.notifiedExpiring30d).toBe(0)
    expect(emailService.send).not.toHaveBeenCalled()
  })

  it('loga batches expirados com saldo restante (sem enviar email de expiração)', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([]) // expiring7d
      .mockResolvedValueOnce([]) // expiring30d
      .mockResolvedValueOnce([{ id: 'b-1', totalCredits: 3, usedCredits: 1 }]) // expired with balance

    const result = await cronService.runCreditExpiration()

    expect(result.expired).toBe(1)
    // Não envia email de expiração para batches já expirados (apenas loga)
    expect(emailService.send).not.toHaveBeenCalled()
  })
})
