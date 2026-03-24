/**
 * Testes de integração — GET /api/v1/sessions
 *                      — POST /api/v1/sessions (book session)
 *
 * Cenários GET:
 *   1. Happy path: estudante lista suas próprias sessões
 *   2. Happy path: admin lista todas as sessões
 *   3. Autenticação: sem headers → 401
 *
 * Cenários POST:
 *   4. Happy path: agendamento com slot disponível e crédito suficiente → 201
 *   5. Erro: créditos insuficientes → 400 (CREDIT_050)
 *   6. Erro: slot já ocupado → 409 (SESSION_050)
 *   7. Validação: availabilitySlotId inválido → 400 (VAL_005)
 *   8. Autenticação: sem headers → 401
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/v1/sessions/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import {
  createTestUser,
  createTestAdmin,
  createTestSlot,
  createTestCreditBatch,
  createTestSession,
  getFutureDate,
} from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let studentNoCredits: User
let admin: User

beforeAll(async () => {
  student = await createTestUser({ email: 'sessions-student@corgly.test' })
  studentNoCredits = await createTestUser({ email: 'sessions-no-credits@corgly.test' })
  admin = await createTestAdmin({ email: 'sessions-admin@corgly.test' })

  // Créditos para o estudante principal
  await createTestCreditBatch({
    userId: student.id,
    type: 'PACK_5',
    totalCredits: 5,
    usedCredits: 0,
  })

  // Slot já ocupado (para testar conflito)
  const occupiedSlot = await createTestSlot({ startAt: getFutureDate(72) })
  await createTestCreditBatch({
    userId: student.id,
    type: 'SINGLE',
    totalCredits: 1,
    usedCredits: 0,
  })
  await createTestSession({
    studentId: student.id,
    availabilitySlotId: occupiedSlot.id,
    status: 'SCHEDULED',
  })

  // Guardar o ID do slot ocupado globalmente
  ;(global as Record<string, unknown>).__occupiedSlotId = occupiedSlot.id
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/sessions', () => {
  it('estudante lista apenas suas próprias sessões', async () => {
    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(Array.isArray(body.data.sessions ?? body.data)).toBe(true)

    // Todas as sessões retornadas pertencem ao estudante
    const sessions = body.data.sessions ?? body.data
    for (const s of sessions) {
      expect(s.studentId).toBe(student.id)
    }
  })

  it('admin lista todas as sessões da plataforma', async () => {
    const request = buildAuthRequest('/api/v1/sessions', admin.id, 'ADMIN')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    const sessions = body.data.sessions ?? body.data
    expect(Array.isArray(sessions)).toBe(true)
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest('/api/v1/sessions')
    const response = await GET(request)
    expect(response.status).toBe(401)
  })

  it('filtra sessões por status quando ?status= é passado', async () => {
    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT', {
      searchParams: { status: 'SCHEDULED' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    const sessions = body.data.sessions ?? body.data
    for (const s of sessions) {
      expect(s.status).toBe('SCHEDULED')
    }
  })
})

// ── Suite POST ────────────────────────────────────────────────────────────────

describe('POST /api/v1/sessions (book)', () => {
  it('agenda sessão com slot disponível e créditos suficientes → 201', async () => {
    const slot = await createTestSlot({ startAt: getFutureDate(100) })

    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT', {
      method: 'POST',
      body: { availabilitySlotId: slot.id },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({
      studentId: student.id,
      availabilitySlotId: slot.id,
      status: 'SCHEDULED',
    })

    // Verificar no banco
    const dbSession = await testPrisma.session.findFirst({
      where: { availabilitySlotId: slot.id },
    })
    expect(dbSession).toBeTruthy()
    expect(dbSession!.studentId).toBe(student.id)
  })

  it('retorna 400 quando estudante não tem créditos (CREDIT_050)', async () => {
    const slot = await createTestSlot({ startAt: getFutureDate(110) })

    const request = buildAuthRequest('/api/v1/sessions', studentNoCredits.id, 'STUDENT', {
      method: 'POST',
      body: { availabilitySlotId: slot.id },
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()

    // Verificar que NÃO foi criada sessão no banco
    const dbSession = await testPrisma.session.findFirst({
      where: { availabilitySlotId: slot.id },
    })
    expect(dbSession).toBeNull()
  })

  it('retorna 409 quando slot já está ocupado (SESSION_050)', async () => {
    const occupiedSlotId = (global as Record<string, unknown>).__occupiedSlotId as string

    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT', {
      method: 'POST',
      body: { availabilitySlotId: occupiedSlotId },
    })
    const response = await POST(request)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 quando availabilitySlotId não é UUID válido (VAL_005)', async () => {
    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT', {
      method: 'POST',
      body: { availabilitySlotId: 'not-a-uuid' },
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('retorna 401 sem autenticação', async () => {
    const slot = await createTestSlot({ startAt: getFutureDate(120) })
    const request = buildRequest('/api/v1/sessions', {
      method: 'POST',
      body: { availabilitySlotId: slot.id },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('retorna 400 quando body está vazio (VAL_001)', async () => {
    const request = buildAuthRequest('/api/v1/sessions', student.id, 'STUDENT', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
