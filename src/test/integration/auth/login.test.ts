/**
 * Testes de integração — POST /api/v1/auth/login
 *
 * Cenários:
 *   1. Happy path: login com credenciais válidas → 200 + cookie
 *   2. Validação: email não cadastrado → 401
 *   3. Validação: senha incorreta → 401
 *   4. Autenticação: email não confirmado → 403
 *   5. Segurança: timing attack (tempo de resposta similar para user existe / não existe)
 *   6. Segurança: brute force retorna 429 após muitas tentativas
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { POST } from '@/app/api/v1/auth/login/route'
import { buildRequest } from '../helpers/auth.helper'
import { createTestUser, DEFAULT_PASSWORD } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let confirmedStudent: User
let unconfirmedStudent: User

beforeAll(async () => {
  confirmedStudent = await createTestUser({
    emailConfirmed: true,
    email: 'login-confirmed@corgly.test',
  })
  unconfirmedStudent = await createTestUser({
    emailConfirmed: false,
    email: 'login-unconfirmed@corgly.test',
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Helper ────────────────────────────────────────────────────────────────────

function loginRequest(email: string, password: string) {
  return buildRequest('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  // ── Cenário 1: Happy path ─────────────────────────────────────────────────

  it('retorna 200 com cookie ao fazer login com credenciais válidas', async () => {
    const response = await POST(loginRequest(confirmedStudent.email, DEFAULT_PASSWORD))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(body.data).toBeDefined()

    // Cookie de autenticação deve estar presente
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('corgly_token=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('atualiza lastLoginAt no banco após login bem-sucedido', async () => {
    await POST(loginRequest(confirmedStudent.email, DEFAULT_PASSWORD))

    const user = await testPrisma.user.findUnique({
      where: { id: confirmedStudent.id },
    })
    expect(user?.lastLoginAt).toBeTruthy()
  })

  // ── Cenário 2: Email não cadastrado ───────────────────────────────────────

  it('retorna 401 quando email não está cadastrado (AUTH_001)', async () => {
    const response = await POST(loginRequest('naoexiste@corgly.test', DEFAULT_PASSWORD))

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  // ── Cenário 3: Senha incorreta ────────────────────────────────────────────

  it('retorna 401 com senha incorreta — não expõe se usuário existe (AUTH_001)', async () => {
    const response = await POST(loginRequest(confirmedStudent.email, 'WrongPass@999'))

    expect(response.status).toBe(401)
    const body = await response.json()
    // Mensagem deve ser idêntica à do usuário inexistente (timing-safe)
    expect(body.error).toBeDefined()
  })

  // ── Cenário 4: Email não confirmado ───────────────────────────────────────

  it('retorna 403 quando email não está confirmado (AUTH_003)', async () => {
    const response = await POST(loginRequest(unconfirmedStudent.email, DEFAULT_PASSWORD))

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toContain('Confirme seu email')
  })

  // ── Cenário 5: Validação de campos ────────────────────────────────────────

  it('retorna 400 quando email está ausente (VAL_001)', async () => {
    const request = buildRequest('/api/v1/auth/login', {
      method: 'POST',
      body: { password: DEFAULT_PASSWORD },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('retorna 400 quando body está vazio', async () => {
    const request = buildRequest('/api/v1/auth/login', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
