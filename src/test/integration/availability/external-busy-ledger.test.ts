/**
 * Testes de integração — ledger de ocupacao externa (item 016)
 *
 * Cenários:
 *   1. Nasce coberto: slot gerado por `generateSlots` DEPOIS de uma ocupacao
 *      gravada nasce `isBlocked = true` / `blockOrigin = 'GOOGLE'`, lido de
 *      volta do banco. Este e o aceite literal do item.
 *   2. Sobrevive a regeneracao: apagar e regerar os slots da janela reproduz o
 *      bloqueio sem nenhuma escrita nova no ledger — o que separa ledger de
 *      bandeira em slot.
 *   3. Fora da ocupacao nasce livre: slot gerado em janela que nao intersecta
 *      nenhuma ocupacao vigente nasce `isBlocked = false` / `blockOrigin = null`.
 *   4. Ocupacao revogada nao cobre: intervalo com `revokedAt` preenchido nao
 *      bloqueia slot gerado depois.
 *   5. Projecao no slot existente: `recordBusy` bloqueia o slot como GOOGLE e
 *      `revokeBusy` do mesmo evento o devolve a livre. Fecha o par
 *      leitura-escrita do item.
 *   6. Aula vendida vira conflito, nunca cancelamento: slot com sessao
 *      SCHEDULED dentro da ocupacao sai em `conflitos` com motivo SESSAO_VIVA,
 *      a sessao continua SCHEDULED e o slot continua sem origem (F8). O item
 *      025 estende o cenario ate o ledger de conflitos: 1 linha aberta, re-sync
 *      idempotente pela unique composta, resolucao automatica quando a sessao
 *      e cancelada, quando a ocupacao e revogada e quando o evento muda de
 *      janela. O claim de notificacao tambem e validado sob concorrencia real.
 *
 * Janelas: `generateSlots` posiciona os slots pela proxima ocorrencia do
 * dayOfWeek a partir de hoje (UTC), entao cada cenario monta a propria janela
 * com deslocamento em dias e horarios proprios, para nao colidir com o
 * `startAt @unique` global de `AvailabilitySlot` entre cenarios da mesma suite.
 * O timezone 'UTC' fixa o offset em zero e torna o horario do slot deterministico.
 */

import { describe, it, expect, afterAll, vi } from 'vitest'
import { testPrisma, cleanDatabase } from '../setup'
import {
  createTestSlot,
  createTestSession,
  createTestUser,
  createTestBusyInterval,
} from '../helpers/db.helper'
import { availabilityService } from '@/services/availability.service'
import { externalBusyService } from '@/services/external-busy.service'
import {
  claimNotification,
  openConflict,
} from '@/services/external-busy-conflict.repository'
import { SessionStatus } from '@/lib/constants/enums'

// O alvo desta suite e o BANCO (unique composta, FKs, default de `motivo`,
// ciclo de vida de `resolvedAt`), nao o transporte de email. O envio real fica
// coberto pelo unit test do servico; aqui ele e neutralizado para que nenhuma
// suite dispare SMTP se por acaso existir um usuario ADMIN no banco de teste.
vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}))

// ── Helpers de janela ─────────────────────────────────────────────────────────

/** Meia-noite UTC de hoje + N dias, a mesma aritmetica de `utcDatePlusDays`. */
function diaUtc(dias: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

/**
 * Localiza o slot gerado por `generateSlots` pela assinatura de horario UTC.
 * O dia exato do slot depende da proxima ocorrencia do dayOfWeek a partir de
 * hoje, entao a janela [hoje, hoje+14) e varrida e o match e pelo HH:mm — cada
 * cenario desta suite usa um horario com minuto distintivo.
 */
async function slotPorAssinatura(
  hora: number,
  minuto: number,
): Promise<{ id: string; isBlocked: boolean; blockOrigin: string | null; startAt: Date }> {
  const candidatos = await testPrisma.availabilitySlot.findMany({
    where: { startAt: { gte: diaUtc(0), lt: diaUtc(14) } },
    select: { id: true, isBlocked: true, blockOrigin: true, startAt: true },
  })
  const slot = candidatos.find(
    (s) => s.startAt.getUTCHours() === hora && s.startAt.getUTCMinutes() === minuto,
  )
  if (!slot) throw new Error(`slot ${hora}:${String(minuto).padStart(2, '0')} nao encontrado`)
  return slot
}

afterAll(async () => {
  await cleanDatabase()
})

// ── Cenários 1 e 2: nasce coberto e sobrevive a regeneracao ──────────────────

describe('generateSlots com ocupacao externa vigente', () => {
  // Ocupacao cobrindo a semana inteira [hoje+7, hoje+14). A semana 0 da
  // geracao cai em [hoje, hoje+7) e a semana 1 em [hoje+7, hoje+14), entao a
  // mesma chamada produz slots dentro e fora da ocupacao.
  const inicioOcupacao = diaUtc(7)
  const fimOcupacao = diaUtc(14)
  const dowSemana1 = inicioOcupacao.getUTCDay()

  it('slot gerado depois da sincronizacao nasce coberto pela ocupacao vigente', async () => {
    await createTestBusyInterval({ startAt: inicioOcupacao, endAt: fimOcupacao })

    const resultado = await availabilityService.generateSlots({
      days: [dowSemana1],
      ranges: [{ start: '14:00', end: '15:00' }],
      weeksAhead: 2,
      timezone: 'UTC',
    })
    expect(resultado.created).toBe(2)

    const cobertos = await testPrisma.availabilitySlot.findMany({
      where: { startAt: { gte: inicioOcupacao, lt: fimOcupacao } },
    })
    expect(cobertos).toHaveLength(1)
    expect(cobertos[0].isBlocked).toBe(true)
    expect(cobertos[0].blockOrigin).toBe('GOOGLE')

    // Controle do mesmo lote: a semana 0 ficou fora da ocupacao e nasceu livre.
    const fora = await testPrisma.availabilitySlot.findMany({
      where: { startAt: { lt: inicioOcupacao } },
    })
    expect(fora).toHaveLength(1)
    expect(fora[0].isBlocked).toBe(false)
    expect(fora[0].blockOrigin).toBeNull()
  })

  it('ledger sobrevive a regeneracao de slots sem nova escrita', async () => {
    // NENHUMA escrita nova no ledger aqui: so apaga e regenera.
    await testPrisma.availabilitySlot.deleteMany({
      where: { startAt: { gte: inicioOcupacao, lt: fimOcupacao } },
    })

    const resultado = await availabilityService.generateSlots({
      days: [dowSemana1],
      ranges: [{ start: '14:00', end: '15:00' }],
      weeksAhead: 2,
      timezone: 'UTC',
    })
    expect(resultado.created).toBe(1)

    const recriado = await testPrisma.availabilitySlot.findFirstOrThrow({
      where: { startAt: { gte: inicioOcupacao, lt: fimOcupacao } },
    })
    expect(recriado.isBlocked).toBe(true)
    expect(recriado.blockOrigin).toBe('GOOGLE')
  })
})

// ── Cenário 3: fora da ocupacao nasce livre ──────────────────────────────────

describe('slot fora de qualquer ocupacao', () => {
  it('nasce livre mesmo com ocupacao vigente em outra janela', async () => {
    // Ocupacao longe (30-37 dias) da janela gerada (0-6 dias).
    await createTestBusyInterval({ startAt: diaUtc(30), endAt: diaUtc(37) })

    const resultado = await availabilityService.generateSlots({
      days: [diaUtc(3).getUTCDay()],
      ranges: [{ start: '16:07', end: '17:07' }],
      weeksAhead: 1,
      timezone: 'UTC',
    })
    expect(resultado.created).toBe(1)

    // O dia exato depende da proxima ocorrencia do dayOfWeek a partir de hoje;
    // o slot gerado e identificado pela assinatura de horario (16:07), unica
    // nesta suite.
    const slot = await slotPorAssinatura(16, 7)
    expect(slot.isBlocked).toBe(false)
    expect(slot.blockOrigin).toBeNull()
  })
})

// ── Cenário 4: ocupacao revogada nao cobre ────────────────────────────────────

describe('ocupacao revogada', () => {
  it('nao bloqueia slot gerado depois do carimbo', async () => {
    // Ocupacao REVOGADA cobrindo a semana corrente [hoje, hoje+7): se o
    // predicado de cobertura ignorasse `revokedAt`, o slot gerado dentro dela
    // nascaria bloqueado.
    await createTestBusyInterval({
      startAt: diaUtc(0),
      endAt: diaUtc(7),
      revokedAt: new Date(),
    })

    const resultado = await availabilityService.generateSlots({
      days: [diaUtc(2).getUTCDay()],
      ranges: [{ start: '18:07', end: '19:07' }],
      weeksAhead: 1,
      timezone: 'UTC',
    })
    expect(resultado.created).toBe(1)

    const slot = await slotPorAssinatura(18, 7)
    expect(slot.isBlocked).toBe(false)
    expect(slot.blockOrigin).toBeNull()
  })
})

// ── Cenário 5: projecao no slot existente ─────────────────────────────────────

describe('projecao recordBusy/revokeBusy no slot existente', () => {
  it('bloqueia como GOOGLE e revogar devolve a livre', async () => {
    const slot = await createTestSlot({
      // Fora da janela de 14 dias gerada pelos cenarios anteriores. Isso evita
      // que outro slot legitimamente sobreposto torne a assercao ambigua.
      startAt: new Date(Date.now() + 400 * 60 * 60 * 1000),
    })

    const bloqueio = await externalBusyService.recordBusy({
      externalEventId: 'evt-projecao-1',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })
    expect(bloqueio.bloqueados).toEqual([slot.id])
    expect(bloqueio.conflitos).toEqual([])

    const bloqueado = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(bloqueado.isBlocked).toBe(true)
    expect(bloqueado.blockOrigin).toBe('GOOGLE')

    const liberacao = await externalBusyService.revokeBusy('evt-projecao-1')
    expect(liberacao.liberados).toEqual([slot.id])

    const liberado = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(liberado.isBlocked).toBe(false)
    expect(liberado.blockOrigin).toBeNull()

    const linha = await testPrisma.externalBusyInterval.findUniqueOrThrow({
      where: { externalEventId: 'evt-projecao-1' },
    })
    expect(linha.revokedAt).not.toBeNull()
  })
})

// ── Cenário 6: aula vendida vira conflito, nunca cancelamento ─────────────────

describe('conflito com aula ja vendida', () => {
  it('registra SESSAO_VIVA em conflitos, persiste 1 linha aberta e mantem sessao e slot intactos', async () => {
    const student = await createTestUser()
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 100 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })

    const resultado = await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-1',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    expect(resultado.bloqueados).toEqual([])
    expect(resultado.conflitos).toHaveLength(1)
    expect(resultado.conflitos[0]).toMatchObject({
      slotId: slot.id,
      motivo: 'SESSAO_VIVA',
      sessionId: sessao.id,
    })
    expect(resultado.conflitos[0].conflictId).toBeTruthy()

    // O conflito virou fato durável: exatamente 1 linha, aberta.
    const conflitos = await testPrisma.externalBusyConflict.findMany({
      where: { sessionId: sessao.id },
    })
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0].resolvedAt).toBeNull()
    expect(conflitos[0].slotId).toBe(slot.id)
    // `motivo` vem do DEFAULT da coluna, nao do codigo.
    expect(conflitos[0].motivo).toBe('SESSAO_VIVA')

    // F8: nada foi cancelado nem bloqueado.
    const sessaoApos = await testPrisma.session.findUniqueOrThrow({
      where: { id: sessao.id },
    })
    expect(sessaoApos.status).toBe('SCHEDULED')

    const slotApos = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(slotApos.isBlocked).toBe(false)
    expect(slotApos.blockOrigin).toBeNull()
  })

  it('re-sync do mesmo evento continua com 1 linha (unique composta)', async () => {
    const student = await createTestUser()
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 104 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })

    await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-2',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })
    await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-2',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    const conflitos = await testPrisma.externalBusyConflict.findMany({
      where: { sessionId: sessao.id },
    })
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0].resolvedAt).toBeNull()
  })

  it('sessao cancelada: o re-sync bloqueia o slot e fecha o conflito', async () => {
    const student = await createTestUser()
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 108 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })

    await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-3',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    // A decisao humana aconteceu fora do job: a aula foi cancelada.
    await testPrisma.session.update({
      where: { id: sessao.id },
      data: { status: SessionStatus.CANCELLED_BY_ADMIN },
    })

    const resultado = await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-3',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    expect(resultado.bloqueados).toEqual([slot.id])
    expect(resultado.conflitos).toEqual([])

    const conflitos = await testPrisma.externalBusyConflict.findMany({
      where: { sessionId: sessao.id },
    })
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0].resolvedAt).not.toBeNull()
  })

  it('revogar a ocupacao fecha o conflito aberto', async () => {
    const student = await createTestUser()
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 112 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })

    await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-4',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    await externalBusyService.revokeBusy('evt-conflito-4')

    const conflitos = await testPrisma.externalBusyConflict.findMany({
      where: { sessionId: sessao.id },
    })
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0].resolvedAt).not.toBeNull()

    // A aula segue de pe: revogar ocupacao externa nunca toca sessao.
    const sessaoApos = await testPrisma.session.findUniqueOrThrow({
      where: { id: sessao.id },
    })
    expect(sessaoApos.status).toBe('SCHEDULED')
  })

  it('mover a ocupacao fecha o conflito que deixou de sobrepor a aula', async () => {
    const student = await createTestUser()
    const slotAntigo = await createTestSlot({
      startAt: new Date(Date.now() + 116 * 60 * 60 * 1000),
    })
    const slotNovo = await createTestSlot({
      startAt: new Date(Date.now() + 120 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slotAntigo.id,
      status: 'SCHEDULED',
    })

    await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-movido',
      startAt: slotAntigo.startAt,
      endAt: slotAntigo.endAt,
    })

    const resultado = await externalBusyService.recordBusy({
      externalEventId: 'evt-conflito-movido',
      startAt: slotNovo.startAt,
      endAt: slotNovo.endAt,
    })

    expect(resultado.bloqueados).toEqual([slotNovo.id])
    const conflito = await testPrisma.externalBusyConflict.findFirstOrThrow({
      where: { sessionId: sessao.id },
    })
    expect(conflito.resolvedAt).not.toBeNull()

    const sessaoApos = await testPrisma.session.findUniqueOrThrow({
      where: { id: sessao.id },
    })
    expect(sessaoApos.status).toBe('SCHEDULED')
  })

  it('create e claim concorrentes elegem exatamente um remetente', async () => {
    const student = await createTestUser()
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 124 * 60 * 60 * 1000),
    })
    const sessao = await createTestSession({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })
    const intervalo = await createTestBusyInterval({
      externalEventId: 'evt-claim-concorrente',
      startAt: slot.startAt,
      endAt: slot.endAt,
    })

    const aberturas = await Promise.all([
      openConflict({ intervalId: intervalo.id, slotId: slot.id, sessionId: sessao.id }),
      openConflict({ intervalId: intervalo.id, slotId: slot.id, sessionId: sessao.id }),
    ])

    expect(aberturas.filter((item) => item.criado)).toHaveLength(1)
    expect(new Set(aberturas.map((item) => item.conflito.id)).size).toBe(1)

    const conflictId = aberturas[0].conflito.id
    const claims = await Promise.all([
      claimNotification(conflictId, 'claim-a'),
      claimNotification(conflictId, 'claim-b'),
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)

    await testPrisma.externalBusyConflict.update({
      where: { id: conflictId },
      data: { notificationClaimedAt: new Date(Date.now() - 3 * 60 * 1000) },
    })
    await expect(claimNotification(conflictId, 'claim-recuperado')).resolves.toBe(true)

    const aposRecuperacao = await testPrisma.externalBusyConflict.findUniqueOrThrow({
      where: { id: conflictId },
    })
    expect(aposRecuperacao.notificationClaimId).toBe('claim-recuperado')
    expect(aposRecuperacao.notificationAttempts).toBe(2)
  })
})
