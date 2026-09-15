// @vitest-environment node
// GAP-03 do loop 09-06-corgly-saas-agenda-google-bloqueio-ocupado. A recorrencia
// semanal lia `isBlocked` so no findFirst de fora da transacao: um blockSlot
// commitado entre aquela leitura e o FOR UPDATE do cron deixava a sessao nascer
// no slot bloqueado, com credito consumido. O spy de creditService.getBalance
// roda o blockSlot uma vez e so devolve o saldo depois do COMMIT, sem espera
// por tempo.
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { CronService } from '@/services/cron.service'
import { availabilityService } from '@/services/availability.service'
import { creditService } from '@/services/credit.service'
import { emailService } from '@/services/email.service'
import { logger } from '@/lib/logger'
import { getCanonicalTimezone, localTimeToUtc } from '@/lib/canonical-timezone'
import { createTestUser, createTestCreditBatch, createTestSlot } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import { prisma } from '@/lib/prisma'
import type { AvailabilitySlot, CreditBatch, RecurringPattern } from '@prisma/client'

const DAY_MS = 24 * 60 * 60 * 1000
let slot: AvailabilitySlot
let lote: CreditBatch
let padrao: RecurringPattern

describe('CronService.runRecurringBookings - slot bloqueado entre a leitura de fora e o FOR UPDATE', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const meioDia = new Date()
    meioDia.setUTCHours(12, 0, 0, 0)
    vi.setSystemTime(meioDia)

    await cleanDatabase()
    const aluno = await createTestUser({ role: 'STUDENT' })
    lote = await createTestCreditBatch({
      userId: aluno.id, totalCredits: 5, usedCredits: 0,
      expiresAt: new Date(Date.now() + 60 * DAY_MS),
    })

    // Replica a aritmetica de runRecurringBookings lida no HEAD (PR4).
    // dayOfWeek igual ao dia UTC de nextWeekStart deixa daysToAdd em 0.
    const nextWeekStart = new Date(Date.now() + 7 * DAY_MS)
    const dayOfWeek = nextWeekStart.getUTCDay()
    const startTime = '10:00'
    const startAt = localTimeToUtc(new Date(nextWeekStart), startTime, await getCanonicalTimezone())

    slot = await createTestSlot({ startAt })
    padrao = await testPrisma.recurringPattern.create({
      data: { studentId: aluno.id, dayOfWeek, startTime, isActive: true },
    })

    vi.spyOn(emailService, 'send').mockResolvedValue(undefined as never)
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    await prisma.$disconnect()
  })

  afterAll(async () => {
    await cleanDatabase()
  })

  it('controle: sem bloqueio, a recorrencia agenda exatamente o slot da fixture', async () => {
    const result = await new CronService().runRecurringBookings()
    expect(result).toEqual({ booked: 1, failed: 0 })
    const sessoes = await testPrisma.session.findMany({ where: { availabilitySlotId: slot.id } })
    expect(sessoes).toHaveLength(1)
    expect(sessoes[0]).toMatchObject({ status: 'SCHEDULED', isRecurring: true, recurringPatternId: padrao.id })
    expect((await testPrisma.creditBatch.findUniqueOrThrow({ where: { id: lote.id } })).usedCredits).toBe(1)
  })

  it('slot bloqueado e commitado entre a leitura de fora e a transacao: zero sessao, zero credito', async () => {
    const getBalanceReal = creditService.getBalance.bind(creditService)
    const sel = { isBlocked: true, version: true } as const
    let chamadasDoGancho = 0
    let erroDoGancho: unknown
    let antesDoBloqueio: unknown = null
    let depoisDoCommit: unknown = null

    vi.spyOn(creditService, 'getBalance').mockImplementation(async (userId: string) => {
      const saldo = await getBalanceReal(userId)
      if (chamadasDoGancho === 0) {
        chamadasDoGancho += 1
        try {
          antesDoBloqueio = await testPrisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id }, select: sel })
          await availabilityService.blockSlot(slot.id) // resolve so depois do COMMIT
          depoisDoCommit = await testPrisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id }, select: sel })
        } catch (e) {
          erroDoGancho = e // nunca relancar: o catch do cron engoliria e daria failed 1 falso
        }
      }
      return saldo
    })

    const result = await new CronService().runRecurringBookings()

    expect(erroDoGancho).toBeUndefined()
    expect(chamadasDoGancho).toBe(1)
    expect(antesDoBloqueio).toEqual({ isBlocked: false, version: 0 })
    expect(depoisDoCommit).toEqual({ isBlocked: true, version: 1 })
    expect(result).toEqual({ booked: 0, failed: 1 })
    expect(await testPrisma.session.count({ where: { availabilitySlotId: slot.id } })).toBe(0)
    expect((await testPrisma.creditBatch.findUniqueOrThrow({ where: { id: lote.id } })).usedCredits).toBe(0)
    expect(await testPrisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id }, select: sel }))
      .toEqual({ isBlocked: true, version: 1 })
    expect(logger.error).toHaveBeenCalledWith(
      '[CronService.runRecurringBookings] pattern error',
      expect.objectContaining({ action: 'cron.recurring', patternId: padrao.id, errorName: 'Error', errorCode: 'SLOT_BLOCKED' }),
    )
    const chamadasDoPadrao = vi.mocked(logger.error).mock.calls.filter((c) => c[0] === '[CronService.runRecurringBookings] pattern error')
    expect(chamadasDoPadrao).toHaveLength(1)
    expect(chamadasDoPadrao[0]).toHaveLength(2)
  })
})
