/**
 * Testes de integração — GET /api/v1/availability
 *                      — POST /api/v1/availability (admin only)
 *
 * Cenários GET:
 *   1. Happy path: retorna slots disponíveis para uma data futura
 *   2. Happy path: não retorna slots bloqueados
 *   3. Validação: parâmetro date ausente → 400
 *   4. Validação: formato de date inválido → 400
 *
 * Cenários POST (geração de slots — admin):
 *   5. Happy path: admin gera slots com sucesso → 201
 *   6. Autorização: estudante não pode gerar slots → 403
 *   7. Autenticação: sem role → 403
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/v1/availability/route'
import { buildRequest, buildAuthRequest } from '../helpers/auth.helper'
import { createTestUser, createTestAdmin, createTestSlot } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let admin: User

// Data futura para os testes
const FUTURE_DATE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
const FUTURE_DATE_STR = FUTURE_DATE.toISOString().slice(0, 10) // YYYY-MM-DD

beforeAll(async () => {
  student = await createTestUser({ email: 'avail-student@corgly.test' })
  admin = await createTestAdmin({ email: 'avail-admin@corgly.test' })

  // Criar slots disponíveis
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 9, 0),
  })
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 10, 0),
  })
  // Slot bloqueado — não deve aparecer
  await createTestSlot({
    startAt: new Date(FUTURE_DATE.getFullYear(), FUTURE_DATE.getMonth(), FUTURE_DATE.getDate(), 11, 0),
    isBlocked: true,
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/availability', () => {
  it('retorna lista de slots disponíveis para uma data futura', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(2)

    // Verificar estrutura de cada slot
    const slot = body.data[0]
    expect(slot).toHaveProperty('id')
    expect(slot).toHaveProperty('startAt')
    expect(slot).toHaveProperty('endAt')
  })

  it('não retorna slots bloqueados na listagem pública', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)
    const body = await response.json()

    const blockedSlots = body.data.filter((s: { isBlocked: boolean }) => s.isBlocked)
    expect(blockedSlots).toHaveLength(0)
  })

  it('endpoint de disponibilidade é público — não requer autenticação', async () => {
    // Nenhum header de auth — deve funcionar
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: FUTURE_DATE_STR },
    })
    const response = await GET(request)
    expect(response.status).toBe(200)
  })

  it('retorna 400 quando date está ausente (VAL_001)', async () => {
    const request = buildRequest('/api/v1/availability')
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 quando date tem formato inválido (VAL_002)', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: '21/03/2026' }, // formato DD/MM/YYYY inválido
    })
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('retorna lista vazia para data sem slots', async () => {
    const request = buildRequest('/api/v1/availability', {
      searchParams: { date: '2030-12-25' }, // data futura sem slots criados
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(0)
  })
})

// ── Suite POST ────────────────────────────────────────────────────────────────

describe('POST /api/v1/availability (admin)', () => {
  it('admin gera slots com sucesso e persiste no banco', async () => {
    const targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const request = buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', {
      method: 'POST',
      body: { date: targetDate, times: ['09:00', '10:00', '14:00'] },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.error).toBeNull()

    // Verificar que os slots foram criados no banco
    const slots = await testPrisma.availabilitySlot.findMany({
      where: { startAt: { gte: new Date(targetDate) } },
    })
    expect(slots.length).toBeGreaterThanOrEqual(3)
  })

  it('estudante não pode criar slots (403)', async () => {
    const request = buildAuthRequest('/api/v1/availability', student.id, 'STUDENT', {
      method: 'POST',
      body: { date: '2030-06-15', times: ['09:00'] },
    })
    const response = await POST(request)

    expect(response.status).toBe(403)
  })

  it('request sem autenticação não pode criar slots (403)', async () => {
    const request = buildRequest('/api/v1/availability', {
      method: 'POST',
      body: { date: '2030-06-15', times: ['09:00'] },
    })
    const response = await POST(request)

    expect(response.status).toBe(403)
  })
})
