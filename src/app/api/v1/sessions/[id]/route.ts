import { NextRequest, NextResponse } from 'next/server'
import { sessionService } from '@/services/session.service'
import { apiResponse } from '@/lib/auth'
import { canEnter } from '@/lib/session/canEnter'
import { getIceServers } from '@/lib/iceServers'
import { SessionStatus, UserRole } from '@/lib/constants/enums'

/** GET /api/v1/sessions/:id — retorna sessão com iceServers quando canEnter() === true */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!

  try {
    const { id } = await params
    const session = await sessionService.getById(id, userId, role)
    if (!session) {
      return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
    }

    // Enriquecer com iceServers e hocuspocusUrl quando a sala pode ser acessada
    const sessionData: Record<string, unknown> = { ...session }
    if (canEnter({ startAt: new Date(session.startAt) })) {
      sessionData.iceServers = getIceServers(userId)
      sessionData.hocuspocusUrl = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? null
    }

    return NextResponse.json(apiResponse(sessionData))
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 })
  }
}

/** PATCH /api/v1/sessions/:id — extend (ADMIN only) or mark COMPLETED */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!

  try {
    const { id } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 })
    }

    const bodyObj = body as Record<string, unknown>

    // Extend session (ADMIN only)
    if ('extendedBy' in bodyObj) {
      if (role !== UserRole.ADMIN) {
        return NextResponse.json(
          apiResponse(null, 'Apenas administradores podem estender a sessão.'),
          { status: 403 },
        )
      }

      const extendedBy = Number(bodyObj.extendedBy)
      if (!Number.isInteger(extendedBy) || extendedBy < 1 || extendedBy > 60) {
        return NextResponse.json(
          apiResponse(null, 'extendedBy deve ser entre 1 e 60 minutos.'),
          { status: 400 },
        )
      }

      const session = await sessionService.getById(id, userId, role)
      if (!session) {
        return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
      }
      if (session.status !== SessionStatus.IN_PROGRESS) {
        return NextResponse.json(
          apiResponse(null, 'Sessão não está em andamento.'),
          { status: 409 },
        )
      }

      const currentExtended = session.extendedBy ?? 0
      if (currentExtended + extendedBy > 60) {
        return NextResponse.json(
          apiResponse(null, 'Limite de extensão total de 60 minutos atingido.'),
          { status: 422 },
        )
      }

      const updated = await sessionService.extendSession(id, extendedBy)
      return NextResponse.json(apiResponse(updated))
    }

    // Mark COMPLETED
    if (bodyObj.status === SessionStatus.COMPLETED) {
      const isParticipant = role === UserRole.ADMIN
      // students can also complete their own session
      const session = await sessionService.getById(id, userId, role)
      if (!session) {
        return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
      }
      if (session.studentId !== userId && role !== UserRole.ADMIN) {
        return NextResponse.json(apiResponse(null, 'Acesso negado.'), { status: 403 })
      }
      if (session.status !== SessionStatus.IN_PROGRESS) {
        return NextResponse.json(
          apiResponse(null, 'Sessão não está em andamento.'),
          { status: 409 },
        )
      }
      const completed = await sessionService.completeSession(id)
      return NextResponse.json(apiResponse(completed))
    }

    // Mark IN_PROGRESS (entering session)
    if (bodyObj.status === SessionStatus.IN_PROGRESS) {
      const session = await sessionService.getById(id, userId, role)
      if (!session) {
        return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
      }
      if (session.studentId !== userId && role !== UserRole.ADMIN) {
        return NextResponse.json(apiResponse(null, 'Acesso negado.'), { status: 403 })
      }
      if (![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)) {
        return NextResponse.json(
          apiResponse(null, 'Sessão não pode ser iniciada neste estado.'),
          { status: 409 },
        )
      }
      if (session.status === SessionStatus.IN_PROGRESS) {
        return NextResponse.json(apiResponse(session)) // already in progress, idempotent
      }
      const started = await sessionService.startSession(id)
      return NextResponse.json(apiResponse(started))
    }

    return NextResponse.json(apiResponse(null, 'Operação não reconhecida.'), { status: 400 })
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 })
  }
}
