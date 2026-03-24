import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiResponse } from '@/lib/auth'
import { generateTurnCredentials } from '@/lib/turn'

/** GET /api/v1/sessions/:id/turn-credentials — credenciais TURN temporárias (HMAC 24h) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!
  const { id: sessionId } = await params

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true },
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

  const turnUrl = process.env.TURN_SERVER_URL
  const turnSecret = process.env.TURN_SERVER_SECRET

  if (!turnUrl || !turnSecret || turnSecret.length < 32) {
    return NextResponse.json(
      apiResponse(null, 'TURN server não configurado.'),
      { status: 503 },
    )
  }

  const { username, credential, ttl } = generateTurnCredentials(userId, turnSecret)

  return NextResponse.json(
    apiResponse({ urls: turnUrl, username, credential, ttl }),
  )
}
