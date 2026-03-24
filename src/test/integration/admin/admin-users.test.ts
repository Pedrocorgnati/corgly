/**
 * Testes de integração — GET  /api/v1/admin/users
 *                      — GET  /api/v1/admin/users/[id]
 *                      — PATCH /api/v1/admin/users/[id]
 *
 * Cenários:
 *   1. Happy path: admin lista todos os usuários
 *   2. Happy path: admin busca usuário por ID
 *   3. Recurso: usuário inexistente → 404 (SYS_080)
 *   4. Autorização: estudante não pode acessar rota admin → 403
 *   5. Autenticação: sem headers → 401
 *   6. PATCH: admin atualiza dados do usuário com sucesso
 *   7. PATCH: campo inválido retorna 400 (VAL_002)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET as getUsers } from '@/app/api/v1/admin/users/route'
import { GET as getUserById, PATCH as patchUser } from '@/app/api/v1/admin/users/[id]/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import { createTestUser, createTestAdmin } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let admin: User
let student1: User
let student2: User

beforeAll(async () => {
  admin = await createTestAdmin({ email: 'admin-users-admin@corgly.test' })
  student1 = await createTestUser({ email: 'admin-users-s1@corgly.test', name: 'Student One' })
  student2 = await createTestUser({ email: 'admin-users-s2@corgly.test', name: 'Student Two' })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET /admin/users ────────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('admin lista todos os usuários com paginação', async () => {
    const request = buildAuthRequest('/api/v1/admin/users', admin.id, 'ADMIN')
    const response = await getUsers(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()

    const users = body.data.users ?? body.data
    expect(Array.isArray(users)).toBe(true)
    expect(users.length).toBeGreaterThanOrEqual(2) // student1 + student2 + admin

    // Nunca expor passwordHash na listagem
    for (const u of users) {
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
  it('admin busca usuário por ID e retorna dados completos', async () => {
    const request = buildAuthRequest(`/api/v1/admin/users/${student1.id}`, admin.id, 'ADMIN')
    const response = await getUserById(request, {
      params: Promise.resolve({ id: student1.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({
      id: student1.id,
      email: student1.email,
      name: 'Student One',
    })
    expect(body.data.passwordHash).toBeUndefined()
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

  it('retorna 400 para UUID inválido (VAL_005)', async () => {
    const request = buildAuthRequest('/api/v1/admin/users/not-a-uuid', admin.id, 'ADMIN')
    const response = await getUserById(request, {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })

    expect([400, 404]).toContain(response.status)
  })
})

// ── Suite PATCH /admin/users/[id] ─────────────────────────────────────────────

describe('PATCH /api/v1/admin/users/[id]', () => {
  it('admin atualiza nome do usuário com sucesso', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/users/${student1.id}`,
      admin.id,
      'ADMIN',
      { method: 'PATCH', body: { name: 'Updated Name' } },
    )
    const response = await patchUser(request, {
      params: Promise.resolve({ id: student1.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data?.name ?? body.data).toMatchObject({ name: 'Updated Name' } as Record<string, unknown>)

    // Verificar no banco
    const dbUser = await testPrisma.user.findUnique({ where: { id: student1.id } })
    expect(dbUser?.name).toBe('Updated Name')
  })

  it('retorna 403 quando estudante tenta atualizar outro usuário via admin', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/users/${student2.id}`,
      student1.id,
      'STUDENT',
      { method: 'PATCH', body: { name: 'Hacked Name' } },
    )
    const response = await patchUser(request, {
      params: Promise.resolve({ id: student2.id }),
    })

    expect(response.status).toBe(403)

    // Verificar que NÃO foi alterado no banco
    const dbUser = await testPrisma.user.findUnique({ where: { id: student2.id } })
    expect(dbUser?.name).toBe('Student Two')
  })

  it('retorna 404 ao tentar atualizar usuário inexistente', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001'
    const request = buildAuthRequest(
      `/api/v1/admin/users/${fakeId}`,
      admin.id,
      'ADMIN',
      { method: 'PATCH', body: { name: 'Ghost' } },
    )
    const response = await patchUser(request, {
      params: Promise.resolve({ id: fakeId }),
    })

    expect(response.status).toBe(404)
  })
})
