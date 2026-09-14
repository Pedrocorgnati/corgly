/**
 * Testes de integracao — sobreposicao de intervalo na geracao de slots (item 017)
 *
 * Cenarios:
 *   1. Duas faixas sobrepostas na MESMA chamada de geracao nao produzem slots
 *      que se sobrepoem: o candidato de startAt distinto que intersecta um ja
 *      aceito no lote e rejeitado e vai para `skipped`.
 *   2. Evento externo (ExternalBusyInterval) de duracao arbitraria comecando no
 *      MEIO de um slot intersecta e bloqueia TODOS os slots que atravessa,
 *      nao apenas o slot cujo inicio coincide com o inicio do evento. As
 *      linhas nascem `isBlocked = true` / `blockOrigin = 'GOOGLE'` (comportamento
 *      do item 016, agora exercido com intervalo que atravessa tres slots).
 *   3. Slot ja bloqueado no banco com startAt distinto do candidato rejeita o
 *      candidato sobreposto: nenhuma linha livre nasce sobre horario ocupado.
 *   4. Slot com sessao viva no banco com startAt distinto do candidato rejeita
 *      o candidato sobreposto: a consulta de sobreposicao cobre os dois ramos
 *      (isBlocked e sessao ocupante), nao so o de bloqueio.
 *
 * Janelas: mesmo padrao de `external-busy-ledger.test.ts` — timezone 'UTC'
 * fixa o offset em zero e cada cenario usa horarios com minuto distintivo para
 * nao colidir com o `startAt @unique` global entre cenarios da mesma suite.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { testPrisma, cleanDatabase } from '../setup'
import {
  createTestSlot,
  createTestSession,
  createTestUser,
  createTestBusyInterval,
} from '../helpers/db.helper'
import { availabilityService } from '@/services/availability.service'

// ── Helpers de janela ─────────────────────────────────────────────────────────

/** Meia-noite UTC de hoje + N dias, a mesma aritmetica de `utcDatePlusDays`. */
function diaUtc(dias: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

/** Data em que `generateSlots` posiciona a proxima ocorrencia do dayOfWeek (week 0). */
function diaDaGeracao(dayOfWeek: number): Date {
  const hoje = diaUtc(0)
  const daysUntil = (dayOfWeek - hoje.getUTCDay() + 7) % 7
  return diaUtc(daysUntil)
}

function em(dia: Date, hora: number, minuto: number): Date {
  return new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora, minuto),
  )
}

/** Slots gerados por assinatura de horario UTC no DIA especifico. */
async function slotsDoDia(
  dia: Date,
  assinaturas: Array<[number, number]>,
): Promise<Array<{ id: string; startAt: Date; endAt: Date; isBlocked: boolean; blockOrigin: string | null }>> {
  const candidatos = await testPrisma.availabilitySlot.findMany({
    where: { startAt: { gte: em(dia, 0, 0), lt: em(dia, 24, 0) } },
    select: { id: true, startAt: true, endAt: true, isBlocked: true, blockOrigin: true },
  })
  return candidatos.filter((s) =>
    assinaturas.some(([h, m]) => s.startAt.getUTCHours() === h && s.startAt.getUTCMinutes() === m),
  )
}

afterAll(async () => {
  await cleanDatabase()
})

// ── Cenario 1: faixas sobrepostas na mesma chamada ───────────────────────────

describe('faixas sobrepostas no mesmo pedido', () => {
  it('rejeita o candidato de startAt distinto que intersecta outro do lote', async () => {
    const dayOfWeek = diaUtc(1).getUTCDay()
    const dia = diaDaGeracao(dayOfWeek)
    const resultado = await availabilityService.generateSlots({
      days: [dayOfWeek],
      ranges: [
        { start: '09:03', end: '10:43' }, // slots 09:03 e 09:53
        { start: '10:03', end: '11:03' }, // candidato 10:03 intersecta 09:53-10:43
      ],
      weeksAhead: 1,
      timezone: 'UTC',
    })

    expect(resultado.created).toBe(2)
    expect(resultado.skipped).toBe(1)

    const gerados = await slotsDoDia(dia, [
      [9, 3],
      [9, 53],
      [10, 3],
    ])
    expect(gerados).toHaveLength(2)
    // Encadeamento legitimo sobrevive: 09:03-09:53 e 09:53-10:43 se tocam sem
    // se sobrepor, e o candidato 10:03 nao foi gravado.
    const sobrepoe = gerados.some(
      (a, i) =>
        gerados.some(
          (b, j) =>
            i !== j && a.startAt < b.endAt && a.endAt > b.startAt,
        ),
    )
    expect(sobrepoe).toBe(false)
  })
})

// ── Cenario 2: evento externo de duracao arbitraria atravessando slots ───────

describe('ocupacao externa de duracao arbitraria', () => {
  it('evento de 90 min comecando no meio do slot bloqueia todos os slots que atravessa', async () => {
    const dayOfWeek = diaUtc(2).getUTCDay()
    const dia = diaDaGeracao(dayOfWeek)

    // Ocupacao de 90 min comecando 25 min DENTRO do primeiro slot (14:32) e
    // terminando no meio do ultimo (16:02). Nenhum slot tem inicio coincidindo
    // com o inicio do evento: cobertura so pode vir do predicado de sobreposicao.
    await createTestBusyInterval({
      startAt: em(dia, 14, 32),
      endAt: em(dia, 16, 2),
    })

    const resultado = await availabilityService.generateSlots({
      days: [dayOfWeek],
      ranges: [{ start: '14:07', end: '16:37' }], // slots 14:07, 14:57 e 15:47
      weeksAhead: 1,
      timezone: 'UTC',
    })
    expect(resultado.created).toBe(3)

    const gerados = await slotsDoDia(dia, [
      [14, 7],
      [14, 57],
      [15, 47],
    ])
    expect(gerados).toHaveLength(3)
    for (const slot of gerados) {
      expect(slot.isBlocked).toBe(true)
      expect(slot.blockOrigin).toBe('GOOGLE')
    }
  })
})

// ── Cenario 3: slot bloqueado existente com startAt distinto ─────────────────

describe('slot bloqueado existente sobreposto ao candidato', () => {
  it('rejeita candidato que intersecta slot bloqueado de startAt distinto', async () => {
    const dayOfWeek = diaUtc(3).getUTCDay()
    const dia = diaDaGeracao(dayOfWeek)

    await createTestSlot({
      startAt: em(dia, 9, 33),
      isBlocked: true,
      blockOrigin: 'MANUAL',
    })

    const resultado = await availabilityService.generateSlots({
      days: [dayOfWeek],
      ranges: [{ start: '09:03', end: '10:53' }], // candidatos 09:03 e 09:53
      weeksAhead: 1,
      timezone: 'UTC',
    })

    // Ambos os candidatos intersectam 09:33-10:23: nenhuma linha nova.
    expect(resultado.created).toBe(0)
    expect(resultado.skipped).toBe(2)

    const naJanela = await slotsDoDia(dia, [
      [9, 3],
      [9, 53],
    ])
    expect(naJanela).toHaveLength(0)
  })
})

// ── Cenario 4: slot com sessao viva existente com startAt distinto ───────────

describe('slot com sessao viva sobreposto ao candidato', () => {
  it('rejeita candidato que intersecta slot ocupado por sessao SCHEDULED', async () => {
    const dayOfWeek = diaUtc(4).getUTCDay()
    const dia = diaDaGeracao(dayOfWeek)

    const student = await createTestUser()
    const ocupado = await createTestSlot({ startAt: em(dia, 20, 11) })
    await createTestSession({
      studentId: student.id,
      availabilitySlotId: ocupado.id,
      status: 'SCHEDULED',
    })

    const resultado = await availabilityService.generateSlots({
      days: [dayOfWeek],
      ranges: [{ start: '19:41', end: '21:31' }], // candidatos 19:41 e 20:31
      weeksAhead: 1,
      timezone: 'UTC',
    })

    // 19:41-20:31 intersecta 20:11-21:01; 20:31-21:21 tambem (20:31 < 21:01).
    expect(resultado.created).toBe(0)
    expect(resultado.skipped).toBe(2)

    const naJanela = await slotsDoDia(dia, [
      [19, 41],
      [20, 31],
    ])
    expect(naJanela).toHaveLength(0)

    // A sessao e o slot originais ficam intactos.
    const sessaoApos = await testPrisma.session.findFirstOrThrow({
      where: { availabilitySlotId: ocupado.id },
    })
    expect(sessaoApos.status).toBe('SCHEDULED')
  })
})
