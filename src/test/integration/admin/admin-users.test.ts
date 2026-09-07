/**
 * Testes de integração — GET /api/v1/admin/users
 *                      — GET /api/v1/admin/users/[id]
 *
 * A rota de detalhe NÃO expõe PATCH (src/app/api/v1/admin/users/[id]/route.ts
 * exporta apenas GET). Importar PATCH aqui quebrava a suíte inteira antes de
 * qualquer teste rodar (TS2305) — o handler nunca existiu.
 *
 * Cenários:
 *   1. Happy path: admin lista alunos com paginação (shape { items, total, page, limit })
 *   2. Autorização: estudante não pode acessar rota admin → 403
 *   3. Autenticação: sem headers → 401
 *   4. Happy path: admin busca aluno por ID (shape { user, stats, creditBatches, ... })
 *   5. Recurso: usuário inexistente → 404
 *   6. Autorização: estudante não pode ler detalhe via rota admin → 403
 *   7. Saldo: stats.creditBalance soma TODOS os lotes válidos, não só a página exibida
 *   8. Lotes: creditBatches vem normalizado (total/used/remaining/expired)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET as getUsers } from '@/app/api/v1/admin/users/route'
import { GET as getUserById } from '@/app/api/v1/admin/users/[id]/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import {
  createTestUser,
  createTestAdmin,
  createTestCreditBatch,
  getFutureDate,
  getPastDate,
} from '../helpers/db.helper'
import { cleanDatabase } from '../setup'
import { PAGINATION } from '@/lib/constants'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let admin: User
let student1: User
let student2: User
/** Aluno com MAIS lotes que o tamanho da página de exibição. */
let studentManyBatches: User

/** Lotes válidos criados para studentManyBatches (usedCredits < totalCredits). */
const BATCHES_BEYOND_PAGE = PAGINATION.USER_DETAIL_PAYMENTS + 3
/** Saldo esperado: cada lote válido contribui com 2 créditos (3 totais - 1 usado). */
const REMAINING_PER_BATCH = 2

beforeAll(async () => {
  admin = await createTestAdmin({ email: 'admin-users-admin@corgly.test' })
  student1 = await createTestUser({ email: 'admin-users-s1@corgly.test', name: 'Student One' })
  student2 = await createTestUser({ email: 'admin-users-s2@corgly.test', name: 'Student Two' })
  studentManyBatches = await createTestUser({
    email: 'admin-users-many@corgly.test',
    name: 'Student Many Batches',
  })

  // Lotes válidos além da janela de paginação — provam que o saldo é agregado
  // no banco e não somado sobre a lista exibida.
  for (let i = 0; i < BATCHES_BEYOND_PAGE; i++) {
    await createTestCreditBatch({
      userId: studentManyBatches.id,
      type: 'PACK_5',
      totalCredits: 3,
      usedCredits: 1,
      expiresAt: getFutureDate(24 * 30),
    })
  }

  // Ruído que NÃO pode entrar no saldo: lote exaurido e lote expirado.
  await createTestCreditBatch({
    userId: studentManyBatches.id,
    type: 'PACK_5',
    totalCredits: 5,
    usedCredits: 5,
    expiresAt: getFutureDate(24 * 30),
  })
  await createTestCreditBatch({
    userId: studentManyBatches.id,
    type: 'SINGLE',
    totalCredits: 4,
    usedCredits: 0,
    expiresAt: getPastDate(24),
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET /admin/users ────────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('admin lista alunos com paginação', async () => {
    const request = buildAuthRequest('/api/v1/admin/users', admin.id, 'ADMIN')
    const response = await getUsers(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()

    // Contrato real da rota: { items, total, page, limit }
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(typeof body.data.total).toBe('number')
    expect(body.data.items.length).toBeGreaterThanOrEqual(3) // 3 estudantes criados

    // Admin não aparece na listagem (filtro role = STUDENT) e passwordHash nunca vaza
    for (const u of body.data.items) {
      expect(u.id).not.toBe(admin.id)
      expect(u.passwordHash).toBeUndefined()
    }
  })

  it('estudante não pode acessar /admin/users (403)', async () => {
    const request = buildAuthRequest('/api/v1/admin/users', student1.id, 'STUDENT')
    const response = await getUsers(request)

    expect(response.status).toBe(403)
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest('/api/v1/admin/users')
    const response = await getUsers(request)
    expect(response.status).toBe(401)
  })
})

// ── Suite GET /admin/users/[id] ───────────────────────────────────────────────

describe('GET /api/v1/admin/users/[id]', () => {
  it('admin busca aluno por ID e retorna o perfil completo', async () => {
    const request = buildAuthRequest(`/api/v1/admin/users/${student1.id}`, admin.id, 'ADMIN')
    const response = await getUserById(request, {
      params: Promise.resolve({ id: student1.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()

    // Contrato real: { user, stats, creditBatches, recentSessions, recentFeedbacks }
    expect(body.data.user).toMatchObject({
      id: student1.id,
      email: student1.email,
      name: 'Student One',
    })
    expect(body.data.user.passwordHash).toBeUndefined()
    expect(body.data.stats).toMatchObject({ creditBalance: 0, totalSessions: 0 })
    expect(Array.isArray(body.data.creditBatches)).toBe(true)
    expect(Array.isArray(body.data.recentSessions)).toBe(true)
    expect(Array.isArray(body.data.recentFeedbacks)).toBe(true)
  })

  it('retorna 404 para usuário inexistente', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const request = buildAuthRequest(`/api/v1/admin/users/${fakeId}`, admin.id, 'ADMIN')
    const response = await getUserById(request, {
      params: Promise.resolve({ id: fakeId }),
    })

    expect(response.status).toBe(404)
  })

  it('estudante não pode buscar usuário por ID via rota admin (403)', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/users/${student2.id}`,
      student1.id,
      'STUDENT',
    )
    const response = await getUserById(request, {
      params: Promise.resolve({ id: student2.id }),
    })

    expect(response.status).toBe(403)
  })

  it('retorna 400 ou 404 para UUID inválido', async () => {
    const request = buildAuthRequest('/api/v1/admin/users/not-a-uuid', admin.id, 'ADMIN')
    const response = await getUserById(request, {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })

    expect([400, 404]).toContain(response.status)
  })

  // ── Critério de aceite: saldo do admin == saldo do aluno ───────────────────

  it('creditBalance soma TODOS os lotes válidos, mesmo além da página exibida', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/users/${studentManyBatches.id}`,
      admin.id,
      'ADMIN',
    )
    const response = await getUserById(request, {
      params: Promise.resolve({ id: studentManyBatches.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()

    // A lista continua paginada...
    expect(body.data.creditBatches.length).toBe(PAGINATION.USER_DETAIL_PAYMENTS)

    // ...mas o saldo cobre todos os lotes válidos, ignorando exaurido e expirado.
    expect(body.data.stats.creditBalance).toBe(BATCHES_BEYOND_PAGE * REMAINING_PER_BATCH)

    // E é estritamente maior que a soma da janela exibida — o sintoma do bug.
    const somaDaJanela = body.data.creditBatches.reduce(
      (acc: number, b: { remaining: number; expired: boolean }) =>
        b.expired ? acc : acc + b.remaining,
      0,
    )
    expect(body.data.stats.creditBalance).toBeGreaterThan(somaDaJanela)
  })

  it('creditBatches vem normalizado com total/used/remaining/expired', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/users/${studentManyBatches.id}`,
      admin.id,
      'ADMIN',
    )
    const response = await getUserById(request, {
      params: Promise.resolve({ id: studentManyBatches.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()

    for (const batch of body.data.creditBatches) {
      expect(batch).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        total: expect.any(Number),
        used: expect.any(Number),
        remaining: expect.any(Number),
        expired: expect.any(Boolean),
      })
      expect(batch.remaining).toBe(batch.total - batch.used)
      // Campos crus do Prisma não vazam para a UI
      expect(batch.totalCredits).toBeUndefined()
      expect(batch.usedCredits).toBeUndefined()
    }
  })
})
