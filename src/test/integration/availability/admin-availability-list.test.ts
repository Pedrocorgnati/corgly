/**
 * GAP-04 ST007 - GET /api/v1/admin/availability e listForAdmin.
 *
 * O painel do professor (`useAdminSchedule`) le a agenda por esta rota. Ela e
 * a unica que devolve slot bloqueado e slot vendido com a sessao ocupante; a
 * rota publica filtra os dois por contrato.
 *
 * Tres slots em `getFutureDate(24 * 15 + k)`: livre, bloqueado (MANUAL) e
 * vendido (sessao SCHEDULED). Janela com folga de pelo menos um dia de cada
 * lado; as bordas de janela ficam com o GAP-08.
 *
 *  L1 admin: 200 com os tres ids; bloqueado com `isBlocked` true, vendido com a
 *     sessao ocupante, livre sem sessao.
 *  L2 aluno: 403 no handler (`requireAdmin` le o papel do banco).
 *  L3 admin sem `date`: 400 (`route.ts:25-30`).
 *
 * Todos regressao, esperado verde.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AvailabilitySlot, Session, User } from '@prisma/client'
import { GET } from '@/app/api/v1/admin/availability/route'
import { buildAuthRequest } from '../helpers/auth.helper'
import {
  createTestAdmin,
  createTestSession,
  createTestSlot,
  createTestUser,
  getFutureDate,
} from '../helpers/db.helper'
import { cleanDatabase } from '../setup'

type SlotAdmin = {
  id: string
  startAt: string
  endAt: string
  isBlocked: boolean
  session: { id: string; status: string; studentName?: string } | null
}

let admin: User
let aluno: User
let livre: AvailabilitySlot
let bloqueado: AvailabilitySlot
let vendido: AvailabilitySlot
let sessao: Session
let janela: string

/** Dia UTC `YYYY-MM-DD` deslocado de `delta` dias. */
function diaUtc(d: Date, delta: number): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta))
    .toISOString()
    .slice(0, 10)
}

beforeAll(async () => {
  await cleanDatabase()
  admin = await createTestAdmin()
  aluno = await createTestUser()
  livre = await createTestSlot({ startAt: getFutureDate(24 * 15 + 1) })
  bloqueado = await createTestSlot({
    startAt: getFutureDate(24 * 15 + 2),
    isBlocked: true,
    blockOrigin: 'MANUAL',
  })
  vendido = await createTestSlot({ startAt: getFutureDate(24 * 15 + 3) })
  sessao = await createTestSession({
    studentId: aluno.id,
    availabilitySlotId: vendido.id,
    status: 'SCHEDULED',
  })
  // `date` = dia UTC anterior ao primeiro slot; `until` = dois dias UTC depois do ultimo.
  janela = `date=${diaUtc(livre.startAt, -1)}&until=${diaUtc(vendido.startAt, 2)}`
})

afterAll(async () => {
  await cleanDatabase()
})

describe('GET /api/v1/admin/availability (GAP-04)', () => {
  it('L1 admin: 200 com livre, bloqueado e vendido, cada um na forma de listForAdmin', async () => {
    const res = await GET(buildAuthRequest(`/api/v1/admin/availability?${janela}`, admin.id, 'ADMIN'))

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: SlotAdmin[] }
    const porId = new Map(json.data.map((s) => [s.id, s]))
    expect(json.data).toHaveLength(3)
    expect([...porId.keys()].sort()).toEqual([livre.id, bloqueado.id, vendido.id].sort())

    expect(porId.get(bloqueado.id)).toMatchObject({ isBlocked: true, session: null })
    expect(porId.get(vendido.id)).toMatchObject({
      isBlocked: false,
      session: { id: sessao.id, status: 'SCHEDULED', studentName: aluno.name },
    })
    expect(porId.get(livre.id)).toEqual({
      id: livre.id,
      startAt: livre.startAt.toISOString(),
      endAt: livre.endAt.toISOString(),
      isBlocked: false,
      session: null,
    })
  })

  it('L2 aluno: 403 no handler', async () => {
    const res = await GET(buildAuthRequest(`/api/v1/admin/availability?${janela}`, aluno.id, 'STUDENT'))

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Acesso restrito a administradores.')
  })

  it('L3 admin sem date: 400', async () => {
    const res = await GET(buildAuthRequest('/api/v1/admin/availability', admin.id, 'ADMIN'))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Parâmetro date inválido. Use formato YYYY-MM-DD.')
  })
})
