/**
 * Testes de integração — GET /api/v1/availability
 *                      — POST /api/v1/availability (admin only)
 *
 * Cenários GET:
 *   1. Happy path: retorna slots disponíveis para uma data futura
 *   2. Happy path: não retorna slots bloqueados
 *   3. Validação: parâmetro date ausente → 400
 *   4. Validação: formato de date inválido → 400
 *
 * Cenários POST (geração de slots — admin):
 *   5. Happy path: admin gera slots com sucesso → 201
 *   6. Autorização: estudante não pode gerar slots → 403
 *   7. Autenticação: sem headers de sessão → 401
 *   8. Deduplicação contra o banco: repetir a mesma geração não recria slots
 *      (created 0, skipped igual ao created da primeira rodada)
 *   9. Deduplicação dentro do lote: faixas idênticas no mesmo pedido não são
 *      contadas duas vezes (created 1, skipped 1, delta de contagem = created)
 *
 * Cenários de concorrência (blockSlot/unblockSlot — item 012):
 *  10. Dois blockSlot concorrentes no mesmo slot: exatamente um vence, o outro
 *      recebe 409, isBlocked final true e version incrementada exatamente 1
 *  11. Dois unblockSlot concorrentes no mesmo slot: mesma forma, isBlocked final
 *      false e version incrementada exatamente 1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/v1/availability/route'
import { buildRequest, buildAuthRequest } from '../helpers/auth.helper'
import { createTestUser, createTestAdmin, createTestSlot } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import { availabilityService } from '@/services/availability.service'
import { AppError } from '@/lib/errors'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let admin: User

// Data futura para os testes
const FUTURE_DATE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
const FUTURE_DATE_STR = FUTURE_DATE.toISOString().slice(0, 10) // YYYY-MM-DD

beforeAll(async () => {
  student = await createTestUser({ email: 'avail-student@corgly.test' })
  admin = await createTestAdmin({ email: 'avail-admin@corgly.test' })

  // Criar slots disponíveis
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 9, 0),
  })
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 10, 0),
  })
  // Slot bloqueado — não deve aparecer
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 11, 0),
    isBlocked: true,
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/availability', () => {
  it('retorna lista de slots disponíveis para uma data futura', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(2)

    // Verificar estrutura de cada slot
    const slot = body.data[0]
    expect(slot).toHaveProperty('id')
    expect(slot).toHaveProperty('startAt')
    expect(slot).toHaveProperty('endAt')
  })

  it('não retorna slots bloqueados na listagem pública', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)
    const body = await response.json()

    const blockedSlots = body.data.filter((s: { isBlocked: boolean }) => s.isBlocked)
    expect(blockedSlots).toHaveLength(0)
  })

  it('endpoint de disponibilidade é público — não requer autenticação', async () => {
    // Nenhum header de auth — deve funcionar
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)
    expect(response.status).toBe(200)
  })

  it('retorna 400 quando date está ausente (VAL_001)', async () => {
    const request = buildRequest('/api/v1/availability')
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 quando date tem formato inválido (VAL_002)', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: '21/03/2026' }, // formato DD/MM/YYYY inválido
    })
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('retorna lista vazia para data sem slots', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: '2030-12-25' }, // data futura sem slots criados
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(0)
  })
})

// ── Suite POST ────────────────────────────────────────────────────────────────

describe('POST /api/v1/availability (admin)', () => {
  it('admin gera slots com sucesso e persiste no banco', async () => {
    // O contrato do handler e o GenerateSlotsSchema (src/schemas/availability.schema.ts):
    // { days, ranges, weeksAhead, timezone? }. O corpo { date, times } usado antes nao
    // existia em nenhum ponto do codigo e reprovava no safeParse, produzindo 400.
    const slotsBefore = await testPrisma.availabilitySlot.count()

    const request = buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', {
      method: 'POST',
      body: {
        days: [1, 3],
        ranges: [{ start: '09:00', end: '11:00' }],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(body.data.created).toBeGreaterThanOrEqual(1)

    // Verificar que os slots foram criados no banco
    const slotsAfter = await testPrisma.availabilitySlot.count()
    expect(slotsAfter - slotsBefore).toBe(body.data.created)
  })

  it('estudante não pode criar slots (403)', async () => {
    const request = buildAuthRequest('/api/v1/availability', student.id, 'STUDENT', {
      method: 'POST',
      body: { date: '2030-06-15', times: ['09:00'] },
    })
    const response = await POST(request)

    expect(response.status).toBe(403)
  })

  it('request sem autenticação não pode criar slots (401)', async () => {
    // Sem os headers injetados pelo proxy, requireAuth (src/lib/auth-guard.ts:25-30)
    // responde 401 (nao autenticado). O 403 e reservado a sessao autenticada sem role
    // de admin, exercitado no caso acima. O proxy responde 401 nessa mesma condicao
    // (src/proxy.test.ts, bloco de disponibilidade), entao handler e proxy concordam.
    const request = buildRequest('/api/v1/availability', {
      method: 'POST',
      body: {
        days: [1],
        ranges: [{ start: '09:00', end: '10:00' }],
        weeksAhead: 1,
      },
    })
    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  // Dia 2 e a faixa de 30 minutos sao deliberados: nenhuma linha nasce deste caso
  // (a faixa e mais curta que a aula de 50 min), mas manter o dia separado dos
  // demais preserva a leitura de qualquer delta de contagem.
  it('responde 400 com mensagem autoral quando a faixa nao gera nenhum horario', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    const response = await POST(
      buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', {
        method: 'POST',
        body: {
          days: [2],
          ranges: [{ start: '09:00', end: '09:30' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        },
      }),
    )

    expect(response.status).toBe(400)
    const corpo = await response.json()

    expect(corpo.data).toBeNull()
    expect(corpo.error).toBeTruthy()
    // O `catch` nu do handler devolvia 'Erro interno.' com 500 para qualquer excecao:
    // a mensagem autoral do servico e o que distingue pedido invalido de falha de banco.
    expect(corpo.error).not.toBe('Erro interno.')

    const depois = await testPrisma.availabilitySlot.count()
    expect(depois).toBe(antes)
  })

  // Dias 4 e 5 e a faixa das 14h sao deliberados: o caso happy path acima usa
  // days [1,3] das 09:00 as 11:00 e o beforeAll cria slots as 9h/10h/11h. Sem
  // essa separacao os deltas de contagem se misturariam entre os casos.
  it('nao recria slots que ja existem, com mais de um startAt', async () => {
    const body = {
      days: [4],
      ranges: [{ start: '14:00', end: '16:00' }],
      weeksAhead: 1,
      timezone: 'America/Sao_Paulo',
    }

    const antes = await testPrisma.availabilitySlot.count()

    const primeira = await POST(
      buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', { method: 'POST', body }),
    )
    expect(primeira.status).toBe(201)
    const corpoPrimeira = await primeira.json()
    expect(corpoPrimeira.data.created).toBeGreaterThanOrEqual(2)

    const depoisDaPrimeira = await testPrisma.availabilitySlot.count()
    expect(depoisDaPrimeira - antes).toBe(corpoPrimeira.data.created)

    const segunda = await POST(
      buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', { method: 'POST', body }),
    )
    expect(segunda.status).toBe(201)
    const corpoSegunda = await segunda.json()

    expect(corpoSegunda.data.created).toBe(0)
    expect(corpoSegunda.data.skipped).toBe(corpoPrimeira.data.created)

    const depoisDaSegunda = await testPrisma.availabilitySlot.count()
    expect(depoisDaSegunda).toBe(depoisDaPrimeira)
  })

  it('nao reporta como criado o horario duplicado dentro do mesmo lote', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    // Duas faixas identicas no mesmo pedido: o GenerateSlotsSchema aceita, e o
    // banco grava uma linha so (startAt e @unique). O contador precisa refletir
    // a linha efetivamente gravada, nao o tamanho do lote pedido.
    const response = await POST(
      buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', {
        method: 'POST',
        body: {
          days: [5],
          ranges: [
            { start: '14:00', end: '15:00' },
            { start: '14:00', end: '15:00' },
          ],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        },
      }),
    )

    expect(response.status).toBe(201)
    const corpo = await response.json()
    expect(corpo.data.created).toBe(1)
    expect(corpo.data.skipped).toBe(1)

    const depois = await testPrisma.availabilitySlot.count()
    expect(depois - antes).toBe(corpo.data.created)
  })
})

// ── Suite de concorrência: blockSlot / unblockSlot ────────────────────────────

describe('blockSlot concorrente (dois escritores no mesmo slot)', () => {
  /**
   * Alvo é a transação do serviço, não a rota: as rotas
   * src/app/api/v1/availability/[id]/{block,unblock}/route.ts apenas repassam
   * err.message com err.status. Datas deliberadamente fora da banda 9h/10h/11h
   * usada pelo beforeAll e fora de days[1,3]/days[4]/days[5] das suítes acima.
   */
  function horarioExclusivo(hora: number): Date {
    return new Date(
      FUTURE_DATE.getFullYear(),
      FUTURE_DATE.getMonth(),
      FUTURE_DATE.getDate(),
      hora,
      30,
    )
  }

  it('exatamente um dos dois bloqueios concorrentes vence', async () => {
    const slot = await createTestSlot({ startAt: horarioExclusivo(19), isBlocked: false })

    const resultados = await Promise.allSettled([
      availabilityService.blockSlot(slot.id),
      availabilityService.blockSlot(slot.id),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejeitados = resultados.filter((r) => r.status === 'rejected')
    expect(rejeitados).toHaveLength(1)
    const erro = (rejeitados[0] as PromiseRejectedResult).reason
    expect(erro).toBeInstanceOf(AppError)
    expect((erro as AppError).status).toBe(409)

    const depois = await testPrisma.availabilitySlot.findUnique({ where: { id: slot.id } })
    expect(depois?.isBlocked).toBe(true)
    expect(depois?.version).toBe(slot.version + 1)
  })

  it('desbloqueio concorrente nao produz dupla escrita', async () => {
    const slot = await createTestSlot({ startAt: horarioExclusivo(20), isBlocked: true })

    const resultados = await Promise.allSettled([
      availabilityService.unblockSlot(slot.id),
      availabilityService.unblockSlot(slot.id),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejeitados = resultados.filter((r) => r.status === 'rejected')
    expect(rejeitados).toHaveLength(1)
    expect(((rejeitados[0] as PromiseRejectedResult).reason as AppError).status).toBe(409)

    const depois = await testPrisma.availabilitySlot.findUnique({ where: { id: slot.id } })
    expect(depois?.isBlocked).toBe(false)
    expect(depois?.version).toBe(slot.version + 1)
  })
})
