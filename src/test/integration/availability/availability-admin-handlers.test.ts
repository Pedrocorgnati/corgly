/**
 * GAP-04 ST001 - matriz de handlers de disponibilidade admin (integracao).
 *
 * Os quatro handlers de mutacao sao chamados direto, com a identidade montada
 * por `buildAuthRequest` (camada de handler). A composicao com o proxy real
 * fica em `availability-proxy-handler.test.ts` (ST002).
 *
 * Classe declarada contra o HEAD PRED (0da0f00): todos os casos sao regressao
 * ou controle, porque o disco ja tem `requireAdmin` nas quatro rotas. Caso que
 * falhar aqui e RED descoberto, nunca RED declarado.
 *
 *  H1 POST admin: 201, created >= 1, delta de linhas igual a created
 *  H2 POST aluno: 403, contagem de availability_slots inalterada
 *  H3 PATCH block admin (slot livre): 200, isBlocked true, MANUAL, version 1
 *  H4 PATCH block aluno: 403, linha inalterada
 *  H5 PATCH unblock admin (bloqueado MANUAL): 200, livre, origem null, version + 1
 *  H6 PATCH unblock aluno: 403, linha inalterada
 *  H7 DELETE admin (slot sem sessao): 204 sem corpo, linha removida
 *  H8 DELETE aluno: 403, linha preservada
 *  H9 controle: admin com tokenVersion 1 no banco e header 0: 401, linha inalterada
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AvailabilitySlot, User } from '@prisma/client'
import { POST } from '@/app/api/v1/availability/route'
import { DELETE } from '@/app/api/v1/availability/[id]/route'
import { PATCH as PATCH_BLOCK } from '@/app/api/v1/availability/[id]/block/route'
import { PATCH as PATCH_UNBLOCK } from '@/app/api/v1/availability/[id]/unblock/route'
import { buildAuthRequest } from '../helpers/auth.helper'
import { createTestAdmin, createTestSlot, createTestUser, getFutureDate } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'

// ── Setup ─────────────────────────────────────────────────────────────────────

const ACESSO_RESTRITO = 'Acesso restrito a administradores.'

// Corpo valido pelo GenerateSlotsSchema. O caso de aluno de availability.test.ts
// usa o corpo legado { date, times }, entao o 403 dele nao exclui a leitura de schema.
const CORPO_POST = {
  days: [1, 3],
  ranges: [{ start: '09:00', end: '11:00' }],
  weeksAhead: 1,
  timezone: 'America/Sao_Paulo',
}

let admin: User
let aluno: User

/** Segundo argumento dos handlers dinamicos do App Router. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

/**
 * Slot fora da semana gerada pelo POST (weeksAhead 1): 15 dias a frente, com
 * deslocamento em horas distinto por caso, porque startAt e @unique.
 */
function slotEm(k: number, extra: { isBlocked?: boolean; blockOrigin?: 'MANUAL' | null } = {}) {
  return createTestSlot({ startAt: getFutureDate(24 * 15 + k), ...extra })
}

async function estado(id: string) {
  const slot: AvailabilitySlot | null = await testPrisma.availabilitySlot.findUnique({ where: { id } })
  return slot && { isBlocked: slot.isBlocked, blockOrigin: slot.blockOrigin, version: slot.version }
}

beforeAll(async () => {
  await cleanDatabase()
  admin = await createTestAdmin()
  aluno = await createTestUser()
})

afterAll(async () => {
  await cleanDatabase()
})

// ── POST /api/v1/availability ─────────────────────────────────────────────────

describe('POST /api/v1/availability (GAP-04)', () => {
  it('H1 [regressao]: admin gera slots, 201 e delta de linhas igual a created', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    const res = await POST(
      buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', { method: 'POST', body: CORPO_POST }),
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.created).toBeGreaterThanOrEqual(1)
    expect((await testPrisma.availabilitySlot.count()) - antes).toBe(json.data.created)
  })

  it('H2 [regressao]: aluno autenticado recebe 403 e nada e criado', async () => {
    const antes = await testPrisma.availabilitySlot.count()
    // Faixa distinta da do H1: se o 403 falhasse, a deduplicacao contra o banco
    // nao mascararia a criacao na contagem.
    const corpo = { ...CORPO_POST, ranges: [{ start: '14:00', end: '16:00' }] }

    const res = await POST(
      buildAuthRequest('/api/v1/availability', aluno.id, 'STUDENT', { method: 'POST', body: corpo }),
    )

    expect(res.status).not.toBe(401)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(ACESSO_RESTRITO)
    expect(await testPrisma.availabilitySlot.count()).toBe(antes)
  })
})

// ── PATCH /api/v1/availability/[id]/block ─────────────────────────────────────

describe('PATCH /api/v1/availability/[id]/block (GAP-04)', () => {
  it('H3 [regressao]: admin bloqueia slot livre, 200 e linha MANUAL com version 1', async () => {
    const slot = await slotEm(1)

    const res = await PATCH_BLOCK(
      buildAuthRequest(`/api/v1/availability/${slot.id}/block`, admin.id, 'ADMIN', { method: 'PATCH', body: {} }),
      ctx(slot.id),
    )

    expect(res.status).toBe(200)
    expect(await estado(slot.id)).toEqual({ isBlocked: true, blockOrigin: 'MANUAL', version: 1 })
  })

  it('H4 [regressao]: aluno recebe 403 e a linha fica como estava', async () => {
    const slot = await slotEm(2)

    const res = await PATCH_BLOCK(
      buildAuthRequest(`/api/v1/availability/${slot.id}/block`, aluno.id, 'STUDENT', { method: 'PATCH', body: {} }),
      ctx(slot.id),
    )

    expect(res.status).not.toBe(401)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(ACESSO_RESTRITO)
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: 0 })
  })
})

// ── PATCH /api/v1/availability/[id]/unblock ───────────────────────────────────

describe('PATCH /api/v1/availability/[id]/unblock (GAP-04)', () => {
  it('H5 [regressao]: admin desbloqueia slot MANUAL, 200, origem null e version incrementada', async () => {
    const slot = await slotEm(3, { isBlocked: true, blockOrigin: 'MANUAL' })

    const res = await PATCH_UNBLOCK(
      buildAuthRequest(`/api/v1/availability/${slot.id}/unblock`, admin.id, 'ADMIN', { method: 'PATCH', body: {} }),
      ctx(slot.id),
    )

    expect(res.status).toBe(200)
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: slot.version + 1 })
  })

  it('H6 [regressao]: aluno recebe 403 e a linha fica como estava', async () => {
    const slot = await slotEm(4, { isBlocked: true, blockOrigin: 'MANUAL' })

    const res = await PATCH_UNBLOCK(
      buildAuthRequest(`/api/v1/availability/${slot.id}/unblock`, aluno.id, 'STUDENT', { method: 'PATCH', body: {} }),
      ctx(slot.id),
    )

    expect(res.status).not.toBe(401)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(ACESSO_RESTRITO)
    expect(await estado(slot.id)).toEqual({ isBlocked: true, blockOrigin: 'MANUAL', version: 0 })
  })
})

// ── DELETE /api/v1/availability/[id] ──────────────────────────────────────────

describe('DELETE /api/v1/availability/[id] (GAP-04)', () => {
  it('H7 [regressao]: admin remove slot sem sessao, 204 sem corpo e linha removida', async () => {
    const slot = await slotEm(5)

    const res = await DELETE(
      buildAuthRequest(`/api/v1/availability/${slot.id}`, admin.id, 'ADMIN', { method: 'DELETE' }),
      ctx(slot.id),
    )

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(await estado(slot.id)).toBeNull()
  })

  it('H8 [regressao]: aluno recebe 403 e a linha e preservada', async () => {
    const slot = await slotEm(6)

    const res = await DELETE(
      buildAuthRequest(`/api/v1/availability/${slot.id}`, aluno.id, 'STUDENT', { method: 'DELETE' }),
      ctx(slot.id),
    )

    expect(res.status).not.toBe(401)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(ACESSO_RESTRITO)
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: 0 })
  })
})

// ── Controle de 401 ───────────────────────────────────────────────────────────

describe('controle de sessao revogada (GAP-04)', () => {
  it('H9 [controle]: admin com tokenVersion 1 no banco e header 0 recebe 401 e nada muda', async () => {
    const revogado = await createTestAdmin({
      tokenVersion: 1,
      email: `admin-revogado-gap04-${Date.now()}@corgly.test`,
    })
    const slot = await slotEm(9)

    const res = await PATCH_BLOCK(
      buildAuthRequest(`/api/v1/availability/${slot.id}/block`, revogado.id, 'ADMIN', {
        method: 'PATCH',
        body: {},
        tokenVersion: 0,
      }),
      ctx(slot.id),
    )

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Sessão invalidada. Faça login novamente.')
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: 0 })
  })
})
