import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      update: vi.fn(),
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

describe('CronService.runReminders', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    vi.mocked(emailService.send).mockResolvedValue(undefined)
    vi.mocked(prisma.session.update).mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna { sent24h: 0, sent1h: 0 } quando não há sessões elegíveis', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([])

    const result = await cronService.runReminders()

    expect(result).toEqual({ sent24h: 0, sent1h: 0 })
  })

  it('envia REMINDER_24H para sessão em 24h com reminderSentAt null', async () => {
    vi.setSystemTime(new Date('2026-03-21T10:00:00Z'))

    const session = {
      id: 'session-1',
      studentId: 'user-1',
      startAt: new Date('2026-03-22T10:00:00Z'), // +24h
      reminderSentAt: null,
      student: {
        email: 'student@test.com',
        name: 'Aluno Test',
        preferredLanguage: 'PT_BR',
        timezone: 'America/Sao_Paulo',
      },
    }

    vi.mocked(prisma.session.findMany)
      .mockResolvedValueOnce([session] as never) // 24h window
      .mockResolvedValueOnce([]) // 1h window

    vi.mocked(prisma.session.update).mockResolvedValue({} as never)

    const result = await cronService.runReminders()

    expect(result.sent24h).toBe(1)
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.stringContaining('REMINDER') }),
    )
  })

  it('envia REMINDER_1H para sessão em 1h com reminderSentAt = 24h', async () => {
    vi.setSystemTime(new Date('2026-03-21T09:00:00Z'))

    const session = {
      id: 'session-2',
      studentId: 'user-2',
      startAt: new Date('2026-03-21T10:00:00Z'), // +1h
      reminderSentAt: { sent24h: new Date('2026-03-20T10:00:00Z') },
      student: {
        email: 'student2@test.com',
        name: 'Aluno Test 2',
        preferredLanguage: 'EN_US',
        timezone: 'UTC',
      },
    }

    // findMany is called once — returns the 1h session (also qualifies for 24h check but that's fine)
    vi.mocked(prisma.session.findMany).mockResolvedValueOnce([session] as never)

    const result = await cronService.runReminders()

    expect(result.sent1h).toBe(1)
  })

  it('não envia reminder para sessão CANCELLED', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([])

    const result = await cronService.runReminders()

    expect(emailService.send).not.toHaveBeenCalled()
    expect(result.sent24h).toBe(0)
    expect(result.sent1h).toBe(0)
  })

  it('não duplica email se reminderSentAt já marcado para este nível', async () => {
    vi.setSystemTime(new Date('2026-03-21T09:30:00Z'))

    // Sessão com reminderSentAt.sent1h já enviado — Prisma query já filtra, retorna []
    vi.mocked(prisma.session.findMany).mockResolvedValueOnce([])

    const result = await cronService.runReminders()

    expect(emailService.send).not.toHaveBeenCalled()
    expect(result.sent24h).toBe(0)
    expect(result.sent1h).toBe(0)
  })
})
