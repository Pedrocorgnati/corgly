/**
 * Testes de integração contra MySQL real — contenção de lock no AvailabilitySlot.
 *
 * A suíte unitária de `availability.service` prova que os quatro formatos de erro
 * de contenção (`code`, `errno`, `meta.code`, `meta.errno` e o texto estreito sob
 * `P2010`) viram `AVAILABILITY_054` / 409. O que ela NÃO pode provar é que o banco
 * de verdade produz um desses formatos: lá o erro é fabricado. Aqui o erro nasce
 * de um `FOR UPDATE` genuinamente disputado no InnoDB.
 *
 * Cenários:
 *   1. `blockSlot` esperando um `FOR UPDATE` já retido por outra transação estoura
 *      o timeout da transação interativa do Prisma e sai como AVAILABILITY_054/409,
 *      não como erro cru vazando para a rota.
 *   2. Mesma forma em `unblockSlot`.
 *   3. Corrida real `blockSlot` contra `SessionService.create` no mesmo slot:
 *      exatamente um vence, o outro recebe 409, e o estado final é coerente
 *      (slot bloqueado sem sessão viva, OU sessão viva com slot não bloqueado).
 *
 * Sobre o timeout: `blockSlot` roda dentro de `prisma.$transaction(fn)` com o
 * timeout interativo default do Prisma (5s). O `innodb_lock_wait_timeout` do
 * servidor é 50s, então quem dispara primeiro é sempre o Prisma. Por isso estes
 * testes NÃO mexem em variável global do MySQL: o container de dev é compartilhado
 * e alterar `innodb_lock_wait_timeout` globalmente afetaria os outros bancos dele.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { availabilityService } from '@/services/availability.service'
import { sessionService } from '@/services/session.service'
import { AppError } from '@/lib/errors'
import { createTestUser, createTestCreditBatch, createTestSlot } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import { prisma } from '@/lib/prisma'
import type { AvailabilitySlot, User } from '@prisma/client'

/**
 * TODAS as fixtures nascem antes da primeira transação de contenção, e não dentro
 * de cada teste. Motivo empírico: quando o Prisma expira uma transação interativa
 * cuja query ainda está parada esperando lock no InnoDB, a conexão volta ao pool
 * com o snapshot antigo; um slot criado DEPOIS disso fica invisível para ela e o
 * `SELECT ... FOR UPDATE` seguinte devolve zero linhas, virando AVAILABILITY_001
 * (404) em vez do 409 de contenção. Criando tudo antes, qualquer snapshot da
 * sessão enxerga as linhas.
 */
let slotBloqueio: AvailabilitySlot
let slotDesbloqueio: AvailabilitySlot
let slotCorrida: AvailabilitySlot
let aluno: User

beforeAll(async () => {
  slotBloqueio = await createTestSlot({ startAt: horarioExclusivo(21), isBlocked: false })
  slotDesbloqueio = await createTestSlot({ startAt: horarioExclusivo(22), isBlocked: true })
  slotCorrida = await createTestSlot({ startAt: horarioExclusivo(23), isBlocked: false })
  aluno = await createTestUser()
  await createTestCreditBatch({ userId: aluno.id, totalCredits: 5 })

  // Força o pool do client da aplicacao a abrir conexao e enxergar as fixtures
  // antes de qualquer transacao expirar.
  await prisma.availabilitySlot.count()
})

afterAll(async () => {
  await cleanDatabase()
})

/**
 * Abre uma transação que trava a linha do slot com `FOR UPDATE` e a mantém
 * travada por `msSegurando`. O `timeout` alto é da transação SEGURADORA, não da
 * vítima: a vítima continua com os 5s default do Prisma, que é justamente o
 * gatilho que queremos observar.
 *
 * O lock NÃO é liberado por sinal externo de propósito. Quando o Prisma expira a
 * transação da vítima, a query dela continua parada no InnoDB esperando o lock;
 * a rejeição só chega ao chamador quando a linha é liberada. Amarrar a liberação
 * ao retorno da vítima seria um impasse circular (foi o que a primeira versão
 * deste helper fez, e as duas transações só saíam pelo timeout de 25s).
 */
function segurarLockDoSlot(slotId: string, msSegurando = 9_000) {
  let travado!: () => void
  const lockPronto = new Promise<void>((resolve) => {
    travado = resolve
  })

  const transacao = testPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM availability_slots WHERE id = ${slotId} FOR UPDATE`
      travado()
      await new Promise((resolve) => setTimeout(resolve, msSegurando))
    },
    { timeout: 25_000, maxWait: 10_000 },
  )

  return { lockPronto, transacao }
}

/** Horários fora das faixas usadas pelas outras suítes de integração. */
function horarioExclusivo(hora: number): Date {
  const base = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hora, 45)
}

describe('contenção real de lock no slot (MySQL)', () => {
  /**
   * Forçar o timeout da transação interativa deixa a conexão do client da
   * aplicacao inutilizavel: a proxima query nela sai como `P1017` (servidor
   * fechou a conexao) e, pior, um `SELECT ... FOR UPDATE` seguinte pode voltar
   * vazio e mascarar a contencao como `AVAILABILITY_001` / 404. Derrubar o pool
   * entre um teste e outro devolve conexao limpa; o Prisma reconecta sozinho na
   * proxima chamada.
   */
  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('blockSlot bloqueado por FOR UPDATE alheio vira AVAILABILITY_054 / 409', async () => {
    const slot = slotBloqueio
    const { lockPronto, transacao } = segurarLockDoSlot(slot.id)
    await lockPronto

    const erro = await availabilityService.blockSlot(slot.id).catch((e: unknown) => e)
    await transacao

    expect(erro).toBeInstanceOf(AppError)
    expect((erro as AppError).code).toBe('AVAILABILITY_054')
    expect((erro as AppError).status).toBe(409)

    // A transação da vítima abortou: nada foi gravado.
    const depois = await testPrisma.availabilitySlot.findUnique({ where: { id: slot.id } })
    expect(depois?.isBlocked).toBe(false)
    expect(depois?.version).toBe(slot.version)
  })

  it('unblockSlot bloqueado por FOR UPDATE alheio vira AVAILABILITY_054 / 409', async () => {
    const slot = slotDesbloqueio
    const { lockPronto, transacao } = segurarLockDoSlot(slot.id)
    await lockPronto

    const erro = await availabilityService.unblockSlot(slot.id).catch((e: unknown) => e)
    await transacao

    expect(erro).toBeInstanceOf(AppError)
    expect((erro as AppError).code).toBe('AVAILABILITY_054')
    expect((erro as AppError).status).toBe(409)

    const depois = await testPrisma.availabilitySlot.findUnique({ where: { id: slot.id } })
    expect(depois?.isBlocked).toBe(true)
    expect(depois?.version).toBe(slot.version)
  })
})

describe('corrida blockSlot contra criação de sessão no mesmo slot', () => {
  /**
   * Os dois caminhos leem `isBlocked` sob `FOR UPDATE`:
   * `SessionService.create` (src/services/session.service.ts, passo 1 e 2) e
   * `blockSlot` (re-check de ocupação sob o lock). Quem chegar segundo enxerga o
   * commit do primeiro. O invariante testado é o par: exatamente um vencedor e um
   * 409, nunca dois sucessos.
   */
  it('exatamente um dos dois vence e o estado final é coerente', async () => {
    const slot = slotCorrida

    const resultados = await Promise.allSettled([
      availabilityService.blockSlot(slot.id),
      sessionService.create(aluno.id, { availabilitySlotId: slot.id }),
    ])

    const [bloqueio, agendamento] = resultados
    const vencedores = resultados.filter((r) => r.status === 'fulfilled')
    expect(vencedores).toHaveLength(1)

    const perdedor = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(perdedor.reason).toBeInstanceOf(AppError)
    expect((perdedor.reason as AppError).status).toBe(409)

    const slotFinal = await testPrisma.availabilitySlot.findUnique({ where: { id: slot.id } })
    const sessoesVivas = await testPrisma.session.count({
      where: { availabilitySlotId: slot.id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
    })

    if (bloqueio.status === 'fulfilled') {
      // Bloqueio venceu: slot bloqueado e nenhuma sessão viva ocupando o horário.
      expect(slotFinal?.isBlocked).toBe(true)
      expect(sessoesVivas).toBe(0)
      expect((agendamento as PromiseRejectedResult).reason).toBeInstanceOf(AppError)
      expect(((agendamento as PromiseRejectedResult).reason as AppError).code).toBe('SESSION_003')
    } else {
      // Agendamento venceu: sessão viva e slot NÃO bloqueado.
      expect(slotFinal?.isBlocked).toBe(false)
      expect(sessoesVivas).toBe(1)
      expect((bloqueio as PromiseRejectedResult).reason).toBeInstanceOf(AppError)
      expect(((bloqueio as PromiseRejectedResult).reason as AppError).code).toBe('AVAILABILITY_051')
    }
  })
})
