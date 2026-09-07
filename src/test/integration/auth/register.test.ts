/**
 * Testes de integração — POST /api/v1/auth (register)
 *
 * Cenários:
 *   1. Happy path: registro com dados válidos → 201 + usuário no banco
 *      (sem sessão: o contrato exige confirmação de email antes do login)
 *   2. Validação: email duplicado → 409 (CONFLICT)
 *   3. Validação: senha fraca → 400 (VAL_002/VAL_004)
 *   4. Validação: campos obrigatórios ausentes → 400 (VAL_001)
 *   5. Segurança: SQL injection no email → sanitizado, sem crash
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/auth/route'
import { buildRequest } from '../helpers/auth.helper'
import { testPrisma, cleanDatabase } from '../setup'

// ── Payload válido base ───────────────────────────────────────────────────────

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Integration Tester',
    email: `register-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@corgly.test`,
    password: 'Register@123',
    country: 'BR',
    timezone: 'America/Sao_Paulo',
    termsAccepted: true,
    // `RegisterSchema` exige consentimento de privacidade (LGPD) alem do aceite
    // de termos; sem ele todo payload "valido" era rejeitado com 400.
    privacyAccepted: true,
    ...overrides,
  }
}

// ── Request builder com IP isolado ────────────────────────────────────────────

let ipCounter = 0

/**
 * A rota aplica rate limit de 5 req/min por IP (`RATE_LIMITS.AUTH_REGISTER`),
 * chaveado em `x-forwarded-for`. Sem esse header todas as requisicoes da suite
 * caem no mesmo balde "unknown" e a partir da sexta o handler responde 429
 * antes de validar qualquer coisa. Cada request recebe um IP proprio para que
 * o teste exercite o cenario que ele declara, nao o rate limiter.
 */
function registerRequest(body: unknown): NextRequest {
  ipCounter += 1
  return buildRequest('/api/v1/auth', {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': `203.0.113.${ipCounter % 240 + 1}` },
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth (register)', () => {
  // Varios cenarios contam linhas da tabela `users`; sem limpeza entre testes a
  // contagem carrega o residuo do teste anterior.
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
  })

  // ── Cenário 1: Happy path ─────────────────────────────────────────────────

  it('cria usuário com dados válidos e retorna 201', async () => {
    const payload = validPayload()
    const response = await POST(registerRequest(payload))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.error).toBeNull()
    // O registro nao devolve o usuario: `authService.register` retorna void e a
    // rota responde apenas com a mensagem de confirmacao de email.
    expect(body.data).toBeNull()
    expect(typeof body.message).toBe('string')

    // Verificar no banco
    const dbUser = await testPrisma.user.findUnique({ where: { email: payload.email } })
    expect(dbUser).toBeTruthy()
    expect(dbUser!.emailConfirmed).toBe(false) // Email ainda não confirmado
    expect(dbUser!.role).toBe('STUDENT')
    expect(dbUser!.passwordHash).not.toBe(payload.password) // hash, nunca texto limpo
  })

  it('não emite cookie de sessão ao registrar (login exige email confirmado)', async () => {
    const payload = validPayload()
    const response = await POST(registerRequest(payload))

    expect(response.status).toBe(201)
    // `authService.login` rejeita usuario com `emailConfirmed = false`; emitir
    // `corgly_token` aqui daria sessao a quem ainda nao confirmou o email.
    const cookieHeader = response.headers.get('set-cookie') ?? ''
    expect(cookieHeader).not.toContain('corgly_token=')
  })

  // ── Cenário 2: Email duplicado ────────────────────────────────────────────

  it('retorna 409 quando email já está cadastrado', async () => {
    const payload = validPayload()

    // Primeiro registro — deve passar
    await POST(registerRequest(payload))

    // Segundo registro com mesmo email — deve falhar
    const response = await POST(registerRequest(payload))

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBeDefined()

    // Verificar que apenas um usuário foi criado
    const count = await testPrisma.user.count({ where: { email: payload.email } })
    expect(count).toBe(1)
  })

  // ── Cenário 3: Validação — senha fraca ────────────────────────────────────

  it('retorna 400 quando senha não atende requisitos (VAL_004)', async () => {
    // muito curta, sem maiúscula/símbolo
    const response = await POST(registerRequest(validPayload({ password: '123' })))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 quando senha não tem letra maiúscula (VAL_002)', async () => {
    const response = await POST(registerRequest(validPayload({ password: 'lowercase@123' })))

    expect(response.status).toBe(400)
  })

  // ── Cenário 4: Campos obrigatórios ausentes (VAL_001) ─────────────────────

  it('retorna 400 quando name está ausente', async () => {
    const { name: _n, ...withoutName } = validPayload()
    const response = await POST(registerRequest(withoutName))

    expect(response.status).toBe(400)
  })

  it('retorna 400 quando email é inválido (VAL_002)', async () => {
    const response = await POST(registerRequest(validPayload({ email: 'not-an-email' })))

    expect(response.status).toBe(400)
  })

  it('retorna 400 quando termsAccepted é false', async () => {
    const response = await POST(registerRequest(validPayload({ termsAccepted: false })))

    expect(response.status).toBe(400)
    // Garantir que nenhum usuário foi criado
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  // ── Cenário 5: Segurança — SQL injection (THREAT-MODEL) ──────────────────

  it('sanitiza tentativa de SQL injection no email', async () => {
    const response = await POST(
      registerRequest(validPayload({ email: "'; DROP TABLE users; --" })),
    )

    // Deve retornar erro de validação, nunca 500
    expect(response.status).toBe(400)

    // Verificar que a tabela users ainda existe e está intacta
    const count = await testPrisma.user.count()
    expect(count).toBeGreaterThanOrEqual(0) // tabela existe
  })

  it('sanitiza tentativa de XSS no campo name', async () => {
    const xssPayload = validPayload({ name: '<script>alert("xss")</script>' })
    const response = await POST(registerRequest(xssPayload))

    // Pode ser 201 (nome aceito, sanitizado no output) ou 400 (validação)
    expect([201, 400]).toContain(response.status)

    if (response.status === 201) {
      const dbUser = await testPrisma.user.findFirst({
        where: { email: xssPayload.email as string },
      })
      // Nome armazenado como texto — não deve executar script no JSON
      expect(typeof dbUser?.name).toBe('string')
    }
  })
})
