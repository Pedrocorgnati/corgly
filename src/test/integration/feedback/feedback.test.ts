/**
 * Testes de integração — GET /api/v1/feedback
 *                      — POST /api/v1/feedback (submit student feedback)
 *
 * Cenários GET:
 *   1. Happy path: estudante lista seus feedbacks
 *   2. Happy path: filtra por sessionId
 *   3. Autenticação: sem headers → 401
 *
 * Cenários POST (admin submits feedback):
 *   4. Happy path: admin submete feedback para sessão COMPLETED → 201
 *   5. Erro: feedback duplicado para mesma sessão → 409
 *   6. Validação: scores fora do range (VAL_003)
 *   7. Validação: comment muito curto (VAL_004)
 *   8. Autenticação: sem headers → 401
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET } from '@/app/api/v1/feedback/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import {
  createTestUser,
  createTestAdmin,
  createTestSlot,
  createTestCreditBatch,
  createTestSession,
  getFutureDate,
  getPastDate,
} from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User, Session } from '@prisma/client'

// Note: POST de feedback é rota de admin — importar do path correto
let adminFeedbackPost: typeof import('@/app/api/v1/admin/sessions/[id]/feedback/route').POST

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let admin: User
let completedSession: Session
let sessionForFeedback: Session
let sessionWithFeedback: Session

beforeAll(async () => {
  const { POST } = await import('@/app/api/v1/admin/sessions/[id]/feedback/route')
  adminFeedbackPost = POST

  student = await createTestUser({ email: 'feedback-student@corgly.test' })
  admin = await createTestAdmin({ email: 'feedback-admin@corgly.test' })

  const creditBatch = await createTestCreditBatch({
    userId: student.id,
    type: 'PACK_5',
    totalCredits: 5,
    usedCredits: 2,
  })

  // Sessão COMPLETED — para testar submissão de feedback
  const pastSlot1 = await createTestSlot({ startAt: getPastDate(48) })
  completedSession = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot1.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })

  // Sessão para testar duplicidade de feedback
  const pastSlot2 = await createTestSlot({ startAt: getPastDate(72) })
  sessionWithFeedback = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot2.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
  // Criar feedback para essa sessão
  await testPrisma.feedback.create({
    data: {
      sessionId: sessionWithFeedback.id,
      clarityScore: 4,
      didacticsScore: 5,
      punctualityScore: 4,
      engagementScore: 5,
      comment: 'Excelente aula, aprendi muito sobre conjugação verbal.',
      adminId: admin.id,
      reviewed: false,
    },
  })

  // Sessão para teste de outro feedback
  const pastSlot3 = await createTestSlot({ startAt: getPastDate(96) })
  sessionForFeedback = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot3.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
})

afterAll(async () => {
  await cleanDatabase()
})

// ── Suite GET ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/feedback', () => {
  it('estudante lista seus feedbacks', async () => {
    const request = buildAuthRequest('/api/v1/feedback', student.id, 'STUDENT')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(Array.isArray(body.data.feedbacks ?? body.data)).toBe(true)
  })

  it('filtra feedbacks por sessionId', async () => {
    const request = buildAuthRequest('/api/v1/feedback', student.id, 'STUDENT', {
      searchParams: { sessionId: sessionWithFeedback.id },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    const feedbacks = body.data.feedbacks ?? body.data
    expect(feedbacks.length).toBe(1)
    expect(feedbacks[0].sessionId).toBe(sessionWithFeedback.id)
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest('/api/v1/feedback')
    const response = await GET(request)
    expect(response.status).toBe(401)
  })
})

// ── Suite POST (admin feedback) ───────────────────────────────────────────────

describe('POST /api/v1/admin/sessions/[id]/feedback', () => {
  const validScores = {
    scores: {
      clarity: 4,
      didactics: 5,
      punctuality: 4,
      engagement: 5,
    },
    comment: 'O estudante demonstrou ótima evolução na pronúncia durante a aula.',
  }

  it('admin submete feedback para sessão COMPLETED → 200 e persiste no banco', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${completedSession.id}/feedback`,
      admin.id,
      'ADMIN',
      { method: 'POST', body: validScores },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: completedSession.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()

    // Verificar no banco
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: completedSession.id },
    })
    expect(dbFeedback).toBeTruthy()
    expect(dbFeedback!.clarityScore).toBe(4)
    expect(dbFeedback!.engagementScore).toBe(5)
  })

  it('admin pode atualizar feedback existente (upsert — não retorna 409)', async () => {
    // Segunda chamada na mesma sessão deve atualizar (upsert)
    const updatedScores = { ...validScores, scores: { ...validScores.scores, clarity: 3 } }
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionWithFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      { method: 'POST', body: updatedScores },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: sessionWithFeedback.id }),
    })

    // Upsert — deve retornar 200 (não 409)
    expect(response.status).toBe(200)

    // Verificar que foi atualizado no banco
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: sessionWithFeedback.id },
    })
    expect(dbFeedback!.clarityScore).toBe(3) // atualizado de 4 para 3
  })

  it('retorna 400 quando score está fora do range 1-5 (VAL_003)', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionForFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      {
        method: 'POST',
        body: {
          scores: { clarity: 6, didactics: 5, punctuality: 4, engagement: 3 }, // clarity > 5
          comment: 'Comentário com tamanho suficiente para passar na validação mínima.',
        },
      },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: sessionForFeedback.id }),
    })

    expect(response.status).toBe(400)
    // Garantir que NADA foi criado no banco
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: sessionForFeedback.id },
    })
    expect(dbFeedback).toBeNull()
  })

  it('retorna 400 quando comment é muito curto (VAL_004)', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionForFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      {
        method: 'POST',
        body: {
          scores: validScores.scores,
          comment: 'Curto', // < 20 chars
        },
      },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: sessionForFeedback.id }),
    })

    expect(response.status).toBe(400)
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest(
      `/api/v1/admin/sessions/${completedSession.id}/feedback`,
      { method: 'POST', body: validScores },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: completedSession.id }),
    })

    expect(response.status).toBe(401)
  })

  it('estudante não pode submeter feedback pela rota admin (403)', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${completedSession.id}/feedback`,
      student.id,
      'STUDENT',
      { method: 'POST', body: validScores },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: completedSession.id }),
    })

    expect(response.status).toBe(403)
  })
})
