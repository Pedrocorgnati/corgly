/**
 * Geracao dupla da mesma faixa de slots em banco recem provisionado (GAP-01, loop 09-06, ST004).
 *
 * Regressao. Prova, no banco que acabou de receber `prisma migrate deploy`, que:
 *   - `availability_slots.startAt` tem UNIQUE real (information_schema.STATISTICS);
 *   - gerar o mesmo pedido duas vezes nao cria horario novo na segunda rodada e mantem
 *     a invariante `created + skipped === totalPedido` de `availability.service.ts`;
 *   - a restricao segura a duplicata mesmo sem o filtro da aplicacao: `createMany` com
 *     `skipDuplicates` grava 0 linhas e `create` rejeita com P2002.
 *
 * Em CI roda na etapa `slots` de scripts/ci/db-provisioning-run.sh, com DATABASE_URL e
 * DATABASE_URL_TEST apontando para o banco corgly_ci_slots. Na suite local tambem roda:
 * guarda os ids que ja existiam e, no fim, apaga so as linhas que apareceram durante as
 * proprias rodadas (lidas logo depois de cada chamada, mesmo quando ela lanca). A suite de
 * integracao roda em singleFork e o banco do CI e descartavel; o risco residual e so uma
 * insercao alheia no mesmo banco durante uma das rodadas.
 * Pedido com fuso explicito para nao depender de `getCanonicalTimezone` (fronteira do GAP-07).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma } from '../setup'
import { prisma } from '@/lib/prisma'
import { availabilityService } from '@/services/availability.service'
import type { GenerateSlotsInput } from '@/schemas/availability.schema'

const PEDIDO: GenerateSlotsInput = {
  days: [1, 3, 5],
  ranges: [{ start: '09:00', end: '12:00' }],
  weeksAhead: 2,
  timezone: 'America/Sao_Paulo',
}

const idsIniciais = new Set<string>()
const idsDasRodadas = new Set<string>()
let pronto = false

function diaUtcAgora(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Linhas de availability_slots que nao existiam antes do arquivo, ordenadas por startAt. */
async function linhasNovas(): Promise<Array<{ id: string; startAt: Date; endAt: Date }>> {
  const todas = await testPrisma.availabilitySlot.findMany({
    select: { id: true, startAt: true, endAt: true },
    orderBy: { startAt: 'asc' },
  })
  return todas.filter((s) => !idsIniciais.has(s.id))
}

/** Roda o pedido e guarda as linhas novas que existem logo depois da rodada, mesmo se ela lancar. */
async function rodada(): ReturnType<typeof availabilityService.generateSlots> {
  try {
    return await availabilityService.generateSlots(PEDIDO)
  } finally {
    for (const s of await linhasNovas()) idsDasRodadas.add(s.id)
  }
}

beforeAll(async () => {
  // O servico usa o singleton de @/lib/prisma; o teste confere pelo testPrisma.
  // Os dois precisam estar no mesmo banco, senao as asserções olham para outro lugar.
  const doTeste = await testPrisma.$queryRawUnsafe<Array<{ banco: string | null }>>(
    'SELECT DATABASE() AS banco',
  )
  const doServico = await prisma.$queryRawUnsafe<Array<{ banco: string | null }>>(
    'SELECT DATABASE() AS banco',
  )
  expect(doTeste[0]?.banco).toBeTruthy()
  expect(doServico[0]?.banco).toBe(doTeste[0]?.banco)

  const existentes = await testPrisma.availabilitySlot.findMany({ select: { id: true } })
  for (const s of existentes) idsIniciais.add(s.id)
  pronto = true
})

afterAll(async () => {
  if (!pronto || idsDasRodadas.size === 0) return
  await testPrisma.availabilitySlot.deleteMany({ where: { id: { in: Array.from(idsDasRodadas) } } })
})

describe('provisionamento: geracao dupla da mesma faixa de slots', () => {
  it('availability_slots.startAt tem UNIQUE real no banco migrado', async () => {
    const indice = await testPrisma.$queryRawUnsafe<
      Array<{ non_unique: unknown; column_name: string }>
    >(
      "SELECT NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'availability_slots' AND INDEX_NAME = 'availability_slots_startAt_key'",
    )
    expect(indice).toHaveLength(1)
    expect(Number(indice[0]?.non_unique)).toBe(0)
    expect(indice[0]?.column_name).toBe('startAt')
  })

  it('segunda rodada do mesmo pedido nao cria horario e a restricao barra a duplicata', async () => {
    const diaAntes = diaUtcAgora()

    // Rodada 1.
    const r1 = await rodada()
    const linhas1 = await linhasNovas()
    if (idsIniciais.size === 0) {
      expect(r1.created).toBeGreaterThan(0)
    } else {
      expect(r1.created + r1.skipped).toBeGreaterThan(0)
    }
    const snapshot1 = linhas1.map((s) => s.startAt.toISOString())

    // Rodada 2, mesmo pedido.
    const r2 = await rodada()
    const snapshot2 = (await linhasNovas()).map((s) => s.startAt.toISOString())

    // O pedido e relativo ao dia UTC corrente: rodadas em dias diferentes pedem horarios
    // diferentes por desenho. Nesse caso o resultado nao prova nada e o teste nao passa.
    if (diaUtcAgora() !== diaAntes) {
      throw new Error('INCONCLUSIVO: virada de dia UTC entre as rodadas; reexecutar')
    }

    expect(r2.created).toBe(0)
    expect(r2.created + r2.skipped).toBe(r1.created + r1.skipped)
    expect(snapshot2).toEqual(snapshot1)

    const contagem = await testPrisma.$queryRawUnsafe<Array<{ total: unknown; distintos: unknown }>>(
      'SELECT COUNT(*) AS total, COUNT(DISTINCT `startAt`) AS distintos FROM `availability_slots`',
    )
    expect(Number(contagem[0]?.total)).toBe(Number(contagem[0]?.distintos))

    // Restricao sem o filtro da aplicacao, com um horario que acabou de ser gravado.
    // Com o conjunto inicial ja cobrindo o pedido, o snapshot 1 fica vazio; usa uma linha existente.
    const alvo =
      linhas1[0] ??
      (await testPrisma.availabilitySlot.findFirst({ select: { startAt: true, endAt: true } }))
    expect(alvo).not.toBeNull()
    if (!alvo) return

    const gravadas = await testPrisma.availabilitySlot.createMany({
      data: [{ startAt: alvo.startAt, endAt: alvo.endAt }],
      skipDuplicates: true,
    })
    expect(gravadas.count).toBe(0)

    await expect(
      testPrisma.availabilitySlot.create({ data: { startAt: alvo.startAt, endAt: alvo.endAt } }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
