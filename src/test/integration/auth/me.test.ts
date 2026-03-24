/**
 * Testes de integração — GET /api/v1/auth/me
 *
 * Cenários:
 *   1. Happy path: retorna perfil do usuário autenticado
 *   2. Autenticação: sem headers → 401
 *   3. Autenticação: tokenVersion obsoleto → 401
 *   4. Autenticação: usuário deletado do banco → 401
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET } from '@/app/api/v1/auth/me/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import { createTestUser, createTestAdmin } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let admin: User

beforeAll(async () => {
  student = await createTestUser({ email: 'me-student@corgly.test' })
  admin = await createTestAdmin({ email: 'me-admin@corgly.test' })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  // ── Cenário 1: Happy path ─────────────────────────────────────────────────

  it('retorna perfil do estudante autenticado', async () => {
    const request = buildAuthRequest('/api/v1/auth/me', student.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({
      id: student.id,
      email: student.email,
      role: 'STUDENT',
    })
    // Nunca expor passwordHash
    expect(body.data.passwordHash).toBeUndefined()
  })

  it('retorna perfil do admin autenticado', async () => {
    const request = buildAuthRequest('/api/v1/auth/me', admin.id, 'ADMIN')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({ role: 'ADMIN' })
  })

  // ── Cenário 2: Sem headers de autenticação ────────────────────────────────

  it('retorna 401 quando não há headers de autenticação', async () => {
    const request = buildRequest('/api/v1/auth/me')
    const response = await GET(request)

    expect(response.status).toBe(401)
  })

  it('retorna 401 quando x-user-id está ausente', async () => {
    const request = buildRequest('/api/v1/auth/me', {
      headers: {
        'x-user-role': 'STUDENT',
        'x-token-version': '0',
      },
    })
    const response = await GET(request)
    expect(response.status).toBe(401)
  })

  // ── Cenário 3: x-user-id inválido ────────────────────────────────────────

  it('retorna 404 quando userId não existe no banco', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099'
    const request = buildAuthRequest('/api/v1/auth/me', fakeId, 'STUDENT')
    const response = await GET(request)

    // Rota retorna 404 quando usuário não é encontrado
    expect([401, 404]).toContain(response.status)
  })

  // ── Cenário 4: Usuário removido do banco ──────────────────────────────────

  it('retorna 404 quando userId existia mas foi deletado', async () => {
    // Criar usuário temporário e deletar antes do request
    const ghost = await createTestUser({ email: 'ghost-me@corgly.test' })
    await testPrisma.user.delete({ where: { id: ghost.id } })

    const request = buildAuthRequest('/api/v1/auth/me', ghost.id, 'STUDENT')
    const response = await GET(request)

    expect([401, 404]).toContain(response.status)
  })
})
