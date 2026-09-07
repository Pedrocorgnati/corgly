/**
 * Testes de integração — devolução do slot à disponibilidade após cancelamento.
 *
 * Defeito coberto: `SessionService.cancel` marca a sessão como
 * `CANCELLED_BY_STUDENT`/`CANCELLED_BY_ADMIN` mas nunca devolve o
 * `AvailabilitySlot` ao pool. Enquanto `Session.availabilitySlotId` for
 * `@unique`, o slot fica preso à primeira `Session` criada sobre ele — nenhum
 * outro aluno consegue comprá-lo, e ele some de `AvailabilityService.getAvailable`
 * para sempre.
 *
 * Cenários:
 *   1. Aluno A reserva → A cancela → aluno B reserva o MESMO slot (deve passar)
 *   2. Aluno A reserva → A cancela → o slot volta a aparecer em `getAvailable`
 *   3. Slot com sessão SCHEDULED viva continua indisponível (não-regressão)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sessionService } from '@/services/session.service'
import { availabilityService } from '@/services/availability.service'
import {
  createTestUser,
  createTestSlot,
  createTestCreditBatch,
  getFutureDate,
} from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let studentA: User
let studentB: User

/** Data (YYYY-MM-DD) usada como âncora da janela de `getAvailable`. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Limite superior exclusivo da janela consultada. `getAvailable` deixou de ter
 * janela propria (item 005), entao cada chamador declara a sua; aqui a janela e
 * a mesma de sete dias que o servico aplicava antes, o que preserva a cobertura
 * dos slots destes casos (+72h e +96h).
 */
function isoDayPlus7(d: Date): string {
  return isoDay(new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000))
}

beforeAll(async () => {
  await cleanDatabase()

  studentA = await createTestUser({ email: 'slot-release-a@corgly.test' })
  studentB = await createTestUser({ email: 'slot-release-b@corgly.test' })

  await createTestCreditBatch({ userId: studentA.id, type: 'PACK_5', totalCredits: 5 })
  await createTestCreditBatch({ userId: studentB.id, type: 'PACK_5', totalCredits: 5 })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('devolução do slot após cancelamento', () => {
  it('aluno B consegue reservar o slot que o aluno A cancelou', async () => {
    const slot = await createTestSlot({ startAt: getFutureDate(48) })

    const bookedByA = await sessionService.create(studentA.id, {
      availabilitySlotId: slot.id,
    })
    expect(bookedByA.status).toBe('SCHEDULED')

    const cancelled = await sessionService.cancel(bookedByA.id, studentA.id, 'STUDENT', {
      reason: 'teste de devolução de slot',
    })
    expect(cancelled.status).toBe('CANCELLED_BY_STUDENT')

    // O ponto do teste: com o slot devolvido, B compra o MESMO availabilitySlotId.
    const bookedByB = await sessionService.create(studentB.id, {
      availabilitySlotId: slot.id,
    })

    expect(bookedByB.status).toBe('SCHEDULED')
    expect(bookedByB.id).not.toBe(bookedByA.id)

    // As duas sessões coexistem: a cancelada é histórico, a viva é a de B.
    const sessions = await testPrisma.session.findMany({
      where: { availabilitySlotId: slot.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        studentId: true,
        status: true,
        cancelledAt: true,
        cancelledBy: true,
      },
    })
    expect(sessions).toHaveLength(2)
    expect(sessions.filter((s) => s.status === 'SCHEDULED')).toHaveLength(1)
    expect(sessions.find((s) => s.status === 'SCHEDULED')?.studentId).toBe(studentB.id)

    // C4.4: a linha cancelada sobrevive a segunda venda com o rastro de
    // cancelamento intacto. Sem esta assercao o teste provaria coexistencia
    // mas nao preservacao do historico.
    const historico = sessions.find((s) => s.id === bookedByA.id)
    expect(historico?.status).toBe('CANCELLED_BY_STUDENT')
    expect(historico?.cancelledAt).toBeInstanceOf(Date)
    expect(historico?.cancelledBy).toBe('STUDENT')
  })

  it('slot cancelado volta a aparecer em getAvailable', async () => {
    const startAt = getFutureDate(72)
    const slot = await createTestSlot({ startAt })

    const booked = await sessionService.create(studentA.id, {
      availabilitySlotId: slot.id,
    })

    const now = new Date()
    const day = isoDay(now)
    const until = isoDayPlus7(now)
    const whileBooked = await availabilityService.getAvailable(day, until)
    expect(whileBooked.some((s) => s.id === slot.id)).toBe(false)

    await sessionService.cancel(booked.id, studentA.id, 'STUDENT', {
      reason: 'teste de devolução de slot',
    })

    const afterCancel = await availabilityService.getAvailable(day, until)
    expect(afterCancel.some((s) => s.id === slot.id)).toBe(true)
  })

  it('slot com sessão SCHEDULED viva continua indisponível', async () => {
    const slot = await createTestSlot({ startAt: getFutureDate(96) })

    await sessionService.create(studentA.id, { availabilitySlotId: slot.id })

    await expect(
      sessionService.create(studentB.id, { availabilitySlotId: slot.id }),
    ).rejects.toThrow()

    const now = new Date()
    const available = await availabilityService.getAvailable(isoDay(now), isoDayPlus7(now))
    expect(available.some((s) => s.id === slot.id)).toBe(false)
  })
})
