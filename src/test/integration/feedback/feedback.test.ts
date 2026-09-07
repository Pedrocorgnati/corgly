/**
 * Testes de integração — GET  /api/v1/feedback
 *                      — POST /api/v1/admin/sessions/[id]/feedback
 *
 * Vocabulário canônico das dimensões (prisma/schema.prisma model Feedback):
 * listening, speaking, writing, vocabulary. Não existe clarity/didactics/
 * punctuality/engagement. O texto livre é `overallFeedback` — `comment` não
 * existe nem no schema Zod nem no banco, e como overallFeedback é opcional,
 * mandar `comment` fazia a validação de tamanho mínimo passar em branco.
 *
 * A janela de feedback é de 48h a partir de session.completedAt
 * (src/lib/feedback/window.ts): sessão COMPLETED sem completedAt é rejeitada
 * com 422 pelo serviço, por isso o setup preenche completedAt.
 *
 * Cenários GET:
 *   1. Happy path: estudante lista seus feedbacks (shape { items, total, page, limit })
 *   2. Happy path: filtra por sessionId
 *   3. Autenticação: sem headers → 401
 *
 * Cenários POST (admin submete feedback):
 *   4. Happy path: admin submete feedback para sessão COMPLETED → 200 e persiste
 *   5. Upsert: segunda submissão na mesma sessão atualiza (não 409)
 *   6. Validação: score fora do range 1-5 → 400 e nada criado
 *   7. Validação: overallFeedback com menos de 20 caracteres → 400
 *   8. Janela: sessão COMPLETED fora das 48h → 422
 *   9. Autenticação: sem headers → 401
 *  10. Autorização: estudante na rota admin → 403
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET } from '@/app/api/v1/feedback/route'
import { POST as adminFeedbackPost } from '@/app/api/v1/admin/sessions/[id]/feedback/route'
import { buildAuthRequest, buildRequest } from '../helpers/auth.helper'
import {
  createTestUser,
  createTestAdmin,
  createTestSlot,
  createTestCreditBatch,
  createTestSession,
  getPastDate,
} from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'
import type { User, Session } from '@prisma/client'

// ── Setup ─────────────────────────────────────────────────────────────────────

let student: User
let admin: User
let completedSession: Session
let sessionForFeedback: Session
let sessionWithFeedback: Session
let staleSession: Session

/** Marca a sessão como concluída em `hoursAgo` horas atrás (controla a janela). */
async function markCompleted(session: Session, hoursAgo: number): Promise<Session> {
  return testPrisma.session.update({
    where: { id: session.id },
    data: { completedAt: getPastDate(hoursAgo) },
  })
}

const validScores = {
  listening: 4,
  speaking: 5,
  writing: 4,
  vocabulary: 5,
}

const validBody = {
  scores: validScores,
  overallFeedback: 'O estudante demonstrou ótima evolução na pronúncia durante a aula.',
}

beforeAll(async () => {
  student = await createTestUser({ email: 'feedback-student@corgly.test' })
  admin = await createTestAdmin({ email: 'feedback-admin@corgly.test' })

  const creditBatch = await createTestCreditBatch({
    userId: student.id,
    type: 'PACK_5',
    totalCredits: 5,
    usedCredits: 2,
  })

  // Sessão COMPLETED dentro da janela — para testar submissão de feedback
  const pastSlot1 = await createTestSlot({ startAt: getPastDate(4) })
  completedSession = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot1.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
  completedSession = await markCompleted(completedSession, 3)

  // Sessão que já nasce com feedback — para testar upsert e o filtro do GET
  const pastSlot2 = await createTestSlot({ startAt: getPastDate(8) })
  sessionWithFeedback = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot2.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
  sessionWithFeedback = await markCompleted(sessionWithFeedback, 7)
  await testPrisma.feedback.create({
    data: {
      sessionId: sessionWithFeedback.id,
      listeningScore: 4,
      speakingScore: 5,
      writingScore: 4,
      vocabularyScore: 5,
      overallFeedback: 'Excelente aula, aprendi muito sobre conjugação verbal.',
      adminId: admin.id,
      reviewed: false,
    },
  })

  // Sessão ainda sem feedback — usada nos testes de validação
  const pastSlot3 = await createTestSlot({ startAt: getPastDate(12) })
  sessionForFeedback = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot3.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
  sessionForFeedback = await markCompleted(sessionForFeedback, 11)

  // Sessão concluída há mais de 48h — janela fechada
  const pastSlot4 = await createTestSlot({ startAt: getPastDate(96) })
  staleSession = await createTestSession({
    studentId: student.id,
    availabilitySlotId: pastSlot4.id,
    creditBatchId: creditBatch.id,
    status: 'COMPLETED',
  })
  staleSession = await markCompleted(staleSession, 72)
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

    // Contrato real de FeedbackService.listForStudent: { items, total, page, limit }
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(typeof body.data.total).toBe('number')
  })

  it('filtra feedbacks por sessionId e devolve as dimensões canônicas', async () => {
    const request = buildAuthRequest('/api/v1/feedback', student.id, 'STUDENT', {
      searchParams: { sessionId: sessionWithFeedback.id },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    const feedbacks = body.data.items

    expect(feedbacks.length).toBe(1)
    expect(feedbacks[0].sessionId).toBe(sessionWithFeedback.id)
    expect(feedbacks[0].scores).toMatchObject({
      listening: expect.any(Number),
      speaking: expect.any(Number),
      writing: expect.any(Number),
      vocabulary: expect.any(Number),
    })
    expect(feedbacks[0].scores.clarity).toBeUndefined()
    expect(feedbacks[0].comment).toBeUndefined()
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest('/api/v1/feedback')
    const response = await GET(request)
    expect(response.status).toBe(401)
  })
})

// ── Suite POST (admin feedback) ───────────────────────────────────────────────

describe('POST /api/v1/admin/sessions/[id]/feedback', () => {
  it('admin submete feedback para sessão COMPLETED → 200 e persiste no banco', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${completedSession.id}/feedback`,
      admin.id,
      'ADMIN',
      { method: 'POST', body: validBody },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: completedSession.id }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBeNull()
    expect(body.data.scores).toMatchObject(validScores)

    // Verificar no banco — colunas reais do model Feedback
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: completedSession.id },
    })
    expect(dbFeedback).toBeTruthy()
    expect(dbFeedback!.listeningScore).toBe(4)
    expect(dbFeedback!.speakingScore).toBe(5)
    expect(dbFeedback!.writingScore).toBe(4)
    expect(dbFeedback!.vocabularyScore).toBe(5)
    expect(dbFeedback!.overallFeedback).toBe(validBody.overallFeedback)
  })

  it('admin pode atualizar feedback existente (upsert — não retorna 409)', async () => {
    // Segunda chamada na mesma sessão deve atualizar (upsert)
    const updatedBody = {
      ...validBody,
      scores: { ...validScores, listening: 3 },
    }
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionWithFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      { method: 'POST', body: updatedBody },
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
    expect(dbFeedback!.listeningScore).toBe(3) // atualizado de 4 para 3
  })

  it('retorna 400 quando score está fora do range 1-5', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionForFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      {
        method: 'POST',
        body: {
          scores: { ...validScores, listening: 6 }, // listening > 5
          overallFeedback: 'Comentário com tamanho suficiente para passar na validação mínima.',
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

  it('retorna 400 quando overallFeedback é muito curto (< 20 caracteres)', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${sessionForFeedback.id}/feedback`,
      admin.id,
      'ADMIN',
      {
        method: 'POST',
        body: {
          scores: validScores,
          overallFeedback: 'Curto',
        },
      },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: sessionForFeedback.id }),
    })

    expect(response.status).toBe(400)
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: sessionForFeedback.id },
    })
    expect(dbFeedback).toBeNull()
  })

  it('retorna 422 quando a janela de 48h já fechou', async () => {
    const request = buildAuthRequest(
      `/api/v1/admin/sessions/${staleSession.id}/feedback`,
      admin.id,
      'ADMIN',
      { method: 'POST', body: validBody },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: staleSession.id }),
    })

    expect(response.status).toBe(422)
    const dbFeedback = await testPrisma.feedback.findUnique({
      where: { sessionId: staleSession.id },
    })
    expect(dbFeedback).toBeNull()
  })

  it('retorna 401 sem autenticação', async () => {
    const request = buildRequest(
      `/api/v1/admin/sessions/${completedSession.id}/feedback`,
      { method: 'POST', body: validBody },
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
      { method: 'POST', body: validBody },
    )
    const response = await adminFeedbackPost(request, {
      params: Promise.resolve({ id: completedSession.id }),
    })

    expect(response.status).toBe(403)
  })
})
