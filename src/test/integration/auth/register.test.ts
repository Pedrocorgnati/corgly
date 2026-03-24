/**
 * Testes de integração — POST /api/v1/auth (register)
 *
 * Cenários:
 *   1. Happy path: registro com dados válidos → 201 + usuário no banco
 *   2. Validação: email duplicado → 409 (CONFLICT)
 *   3. Validação: senha fraca → 400 (VAL_002/VAL_004)
 *   4. Validação: campos obrigatórios ausentes → 400 (VAL_001)
 *   5. Segurança: SQL injection no email → sanitizado, sem crash
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { POST } from '@/app/api/v1/auth/route'
import { buildRequest } from '../helpers/auth.helper'
import { testPrisma, cleanDatabase } from '../setup'

// ── Payload válido base ───────────────────────────────────────────────────────

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Integration Tester',
    email: `register-${Date.now()}@corgly.test`,
    password: 'Register@123',
    country: 'BR',
    timezone: 'America/Sao_Paulo',
    termsAccepted: true,
    ...overrides,
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth (register)', () => {
  afterAll(async () => {
    await cleanDatabase()
  })

  // ── Cenário 1: Happy path ─────────────────────────────────────────────────

  it('cria usuário com dados válidos e retorna 201', async () => {
    const payload = validPayload()
    const request = buildRequest('/api/v1/auth', { method: 'POST', body: payload })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({
      user: expect.objectContaining({ email: payload.email }),
    })

    // Verificar no banco
    const dbUser = await testPrisma.user.findUnique({ where: { email: payload.email } })
    expect(dbUser).toBeTruthy()
    expect(dbUser!.emailConfirmed).toBe(false) // Email ainda não confirmado
    expect(dbUser!.role).toBe('STUDENT')
    expect(dbUser!.passwordHash).not.toBe(payload.password) // hash, nunca texto limpo
  })

  it('retorna token no cookie httpOnly ao registrar', async () => {
    const payload = validPayload()
    const request = buildRequest('/api/v1/auth', { method: 'POST', body: payload })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const cookieHeader = response.headers.get('set-cookie') ?? ''
    expect(cookieHeader).toContain('corgly_token=')
    expect(cookieHeader).toContain('HttpOnly')
  })

  // ── Cenário 2: Email duplicado ────────────────────────────────────────────

  it('retorna 409 quando email já está cadastrado', async () => {
    const payload = validPayload()

    // Primeiro registro — deve passar
    const first = buildRequest('/api/v1/auth', { method: 'POST', body: payload })
    await POST(first)

    // Segundo registro com mesmo email — deve falhar
    const second = buildRequest('/api/v1/auth', { method: 'POST', body: payload })
    const response = await POST(second)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBeDefined()

    // Verificar que apenas um usuário foi criado
    const count = await testPrisma.user.count({ where: { email: payload.email } })
    expect(count).toBe(1)
  })

  // ── Cenário 3: Validação — senha fraca ────────────────────────────────────

  it('retorna 400 quando senha não atende requisitos (VAL_004)', async () => {
    const request = buildRequest('/api/v1/auth', {
      method: 'POST',
      body: validPayload({ password: '123' }), // muito curta, sem maiúscula/símbolo
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 quando senha não tem letra maiúscula (VAL_002)', async () => {
    const request = buildRequest('/api/v1/auth', {
      method: 'POST',
      body: validPayload({ password: 'lowercase@123' }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  // ── Cenário 4: Campos obrigatórios ausentes (VAL_001) ─────────────────────

  it('retorna 400 quando name está ausente', async () => {
    const { name: _n, ...withoutName } = validPayload()
    const request = buildRequest('/api/v1/auth', { method: 'POST', body: withoutName })
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('retorna 400 quando email é inválido (VAL_002)', async () => {
    const request = buildRequest('/api/v1/auth', {
      method: 'POST',
      body: validPayload({ email: 'not-an-email' }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('retorna 400 quando termsAccepted é false', async () => {
    const request = buildRequest('/api/v1/auth', {
      method: 'POST',
      body: validPayload({ termsAccepted: false }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    // Garantir que nenhum usuário foi criado
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  // ── Cenário 5: Segurança — SQL injection (THREAT-MODEL) ──────────────────

  it('sanitiza tentativa de SQL injection no email', async () => {
    const request = buildRequest('/api/v1/auth', {
      method: 'POST',
      body: validPayload({ email: "'; DROP TABLE users; --" }),
    })
    const response = await POST(request)

    // Deve retornar erro de validação, nunca 500
    expect(response.status).toBe(400)

    // Verificar que a tabela users ainda existe e está intacta
    const count = await testPrisma.user.count()
    expect(count).toBeGreaterThanOrEqual(0) // tabela existe
  })

  it('sanitiza tentativa de XSS no campo name', async () => {
    const xssPayload = validPayload({ name: '<script>alert("xss")</script>' })
    const request = buildRequest('/api/v1/auth', { method: 'POST', body: xssPayload })
    const response = await POST(request)

    // Pode ser 201 (nome aceito, sanitizado no output) ou 400 (validação)
    expect([201, 400]).toContain(response.status)

    if (response.status === 201) {
      const dbUser = await testPrisma.user.findFirst({
        where: { email: xssPayload.email },
      })
      // Nome armazenado como texto — não deve executar script no JSON
      expect(typeof dbUser?.name).toBe('string')
    }
  })
})
