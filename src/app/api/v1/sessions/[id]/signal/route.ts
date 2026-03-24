import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiResponse } from '@/lib/auth'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { signalingService } from '@/services/signaling.service'
import type { SessionSignal, SignalType } from '@/types/sala-virtual'
import { SessionStatus, UserRole } from '@/lib/constants/enums'

const MAX_PAYLOAD_BYTES = 10 * 1024 // 10 KB

const SignalBodySchema = z.object({
  type: z.enum(['offer', 'answer', 'candidate']),
  payload: z.record(z.unknown()),
})

async function isSessionParticipant(
  sessionId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  if (role === UserRole.ADMIN) return true
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  })
  return session?.studentId === userId
}

/** GET /api/v1/sessions/:id/signal — WebRTC signaling polling */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!
  const { id: sessionId } = await params

  // Rate limit: 120 req/min por userId
  const rl = await checkRateLimit(`signal-get:${userId}`, RATE_LIMITS.SIGNAL_GET)
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Taxa de requisições excedida. Tente novamente.'),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  const participant = await isSessionParticipant(sessionId, userId, role)
  if (!participant) {
    return NextResponse.json(apiResponse(null, 'Acesso negado: não é participante da sessão.'), { status: 403 })
  }

  const after = request.nextUrl.searchParams.get('after') ?? undefined

  // Buscar userId do peer — para sessions: se student GET → buscar signals do admin
  // Usar lógica: retornar todos signals que NÃO foram postados por este userId
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true },
  })
  if (!session) {
    return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
  }

  // O peer é o outro participante
  const peerUserId = session.studentId === userId ? 'admin-peer' : session.studentId
  const signals = await signalingService.getSignals(sessionId, userId, peerUserId, after)

  return NextResponse.json(apiResponse(signals))
}

/** POST /api/v1/sessions/:id/signal — WebRTC signaling store */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')!
  const role = request.headers.get('x-user-role')!
  const { id: sessionId } = await params

  // Rate limit: 60 req/min por userId
  const rl = await checkRateLimit(`signal-post:${userId}`, RATE_LIMITS.SIGNAL_POST)
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Taxa de requisições excedida. Tente novamente.'),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  // Validar tamanho do payload (10 KB)
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(apiResponse(null, 'Payload excede limite de 10 KB.'), { status: 413 })
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  })
  if (!session) {
    return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 })
  }

  // Auth: apenas participantes
  const isParticipant = session.studentId === userId || role === UserRole.ADMIN
  if (!isParticipant) {
    return NextResponse.json(
      apiResponse(null, 'Acesso negado: não é participante da sessão.'),
      { status: 403 },
    )
  }

  // Verificar status da sessão
  if (![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)) {
    return NextResponse.json(
      apiResponse(null, 'Sessão não está ativa para sinalização.'),
      { status: 409 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 })
  }

  // Validar payload
  const parsed = SignalBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos: ' + parsed.error.issues[0].message),
      { status: 400 },
    )
  }

  // Validar que payload é objeto simples (prevenção SDP injection)
  if (typeof parsed.data.payload !== 'object' || Array.isArray(parsed.data.payload)) {
    return NextResponse.json(apiResponse(null, 'Payload deve ser um objeto.'), { status: 400 })
  }

  const signal: SessionSignal = {
    type: parsed.data.type as SignalType,
    payload: parsed.data.payload as RTCSdpInit | RTCIceCandidateInit,
    from: userId,
    timestamp: new Date().toISOString(),
  }

  // Armazenar para o peer (se student → armazenar como 'admin-peer' chave; se admin → para studentId)
  const peerKey = role === UserRole.ADMIN ? session.studentId : 'admin-peer'
  await signalingService.storeSignal(sessionId, peerKey, signal)

  return NextResponse.json(apiResponse(null, null, 'Sinal registrado.'), { status: 201 })
}
