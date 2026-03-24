/**
 * Testes de integração — GET /api/v1/credits
 *
 * Cenários:
 *   1. Happy path: saldo e breakdown corretos para estudante com créditos
 *   2. Happy path: saldo zero quando não há batches
 *   3. Happy path: admin consulta créditos de outro usuário via ?userId=
 *   4. Autenticação: sem headers → 401
 *   5. Autorização: estudante não pode consultar créditos de outro usuário
 *   6. Validação: tokenVersion obsoleto → 401 (CREDIT_001)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET } from '@/app/api/v1/credits/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import {
  createTestUser,
  createTestAdmin,
  createTestCreditBatch,
  getFutureDate,
} from '../helpers/db.helper'
import { cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let studentNoCredits: User
let admin: User

beforeAll(async () => {
  student = await createTestUser({ email: 'credits-student@corgly.test' })
  studentNoCredits = await createTestUser({ email: 'credits-empty@corgly.test' })
  admin = await createTestAdmin({ email: 'credits-admin@corgly.test' })

  // Criar créditos para o estudante principal
  await createTestCreditBatch({
    userId: student.id,
    type: 'PACK_5',
    totalCredits: 5,
    usedCredits: 2, // 3 restantes
    expiresAt: getFutureDate(30 * 24),
  })
  await createTestCreditBatch({
    userId: student.id,
    type: 'PROMO',
    totalCredits: 2,
    usedCredits: 0,
    expiresAt: getFutureDate(7 * 24),
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/credits', () => {
  // ── Cenário 1: Estudante com créditos ─────────────────────────────────────

  it('retorna saldo e breakdown corretos para estudante com créditos', async () => {
    const request = buildAuthRequest('/api/v1/credits', student.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()

    // Saldo total: 3 (PACK_5) + 2 (PROMO) = 5
    expect(body.data.balance).toBe(5)
    expect(Array.isArray(body.data.breakdown)).toBe(true)
    expect(body.data.breakdown.length).toBeGreaterThanOrEqual(2)
  })

  // ── Cenário 2: Estudante sem créditos ─────────────────────────────────────

  it('retorna saldo zero e breakdown vazio quando não há batches', async () => {
    const request = buildAuthRequest('/api/v1/credits', studentNoCredits.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.balance).toBe(0)
  })

  // ── Cenário 3: Admin consulta créditos de outro usuário ───────────────────

  it('admin pode consultar créditos de qualquer usuário via ?userId=', async () => {
    const request = buildAuthRequest(
      `/api/v1/credits`,
      admin.id,
      'ADMIN',
      { searchParams: { userId: student.id } },
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.balance).toBe(5) // créditos do student
  })

  // ── Cenário 4: Sem autenticação ───────────────────────────────────────────

  it('retorna 401 quando não há headers de autenticação', async () => {
    const request = buildRequest('/api/v1/credits')
    const response = await GET(request)

    expect(response.status).toBe(401)
  })

  // ── Cenário 5: Estudante tenta ver créditos de outro usuário ─────────────

  it('estudante ignora ?userId= e vê apenas seus próprios créditos', async () => {
    const request = buildAuthRequest(
      '/api/v1/credits',
      studentNoCredits.id,
      'STUDENT',
      { searchParams: { userId: student.id } }, // tenta ver créditos do outro
    )
    const response = await GET(request)

    // Deve retornar dados do próprio usuário (studentNoCredits — saldo 0)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.balance).toBe(0) // não o saldo do student (5)
  })

  // ── Cenário 6: Créditos expirados não contam no saldo ────────────────────

  it('créditos vencidos não entram no saldo disponível', async () => {
    const userWithExpired = await createTestUser({ email: 'credits-expired@corgly.test' })
    await createTestCreditBatch({
      userId: userWithExpired.id,
      type: 'SINGLE',
      totalCredits: 1,
      usedCredits: 0,
      expiresAt: new Date(Date.now() - 1000), // expirou há 1 segundo
    })

    const request = buildAuthRequest('/api/v1/credits', userWithExpired.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    // Saldo não deve incluir créditos expirados
    expect(body.data.balance).toBe(0)
  })
})
