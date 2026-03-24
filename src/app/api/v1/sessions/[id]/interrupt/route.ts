import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiResponse } from '@/lib/auth'
import { sessionService } from '@/services/session.service'
import { signalingService } from '@/services/signaling.service'

const InterruptBodySchema = z.object({
  reason: z.enum(['connection_lost', 'teacher_ended']),
})

/** PATCH /api/v1/sessions/:id/interrupt — interrompe sessão e reembolsa crédito */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!
  const { id: sessionId } = await params

  // Verificar que o usuário é participante da sessão
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  })
  if (!session) {
    return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
  }

  const isParticipant = session.studentId === userId || role === 'ADMIN'
  if (!isParticipant) {
    return NextResponse.json(
      apiResponse(null, 'Acesso negado: não é participante da sessão.'),
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 })
  }

  const parsed = InterruptBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'reason deve ser connection_lost ou teacher_ended.'),
      { status: 400 },
    )
  }

  // Apenas ADMIN pode usar teacher_ended
  if (parsed.data.reason === 'teacher_ended' && role !== 'ADMIN') {
    return NextResponse.json(
      apiResponse(null, 'Apenas administradores podem encerrar com teacher_ended.'),
      { status: 403 },
    )
  }

  try {
    const result = await sessionService.interruptSession(sessionId, parsed.data.reason)

    // Limpar signals da sessão
    await signalingService.clearSignals(sessionId)

    return NextResponse.json(apiResponse(result))
  } catch (err) {
    const e = err as { code?: string; status?: number; message?: string }
    if (e.code === 'SESSION_060') {
      return NextResponse.json(apiResponse(null, e.message ?? 'Estado inválido.'), { status: 409 })
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 })
  }
}
