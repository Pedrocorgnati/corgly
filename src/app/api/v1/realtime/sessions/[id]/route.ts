import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiResponse } from '@/lib/auth'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { realtimeSignalingService } from '@/lib/sessions/realtime-signaling.service'
import type { SessionSignal, SignalType } from '@/types/sala-virtual'

/**
 * Endpoint de realtime signaling — Fase 1 do ADR-0002.
 *
 * GET  /api/v1/realtime/sessions/:id  — negocia o transporte (ws|poll). Em Fase 1
 *      (flag `REALTIME_WS_ENABLED` off) devolve o descritor poll apontando para o
 *      endpoint `/api/v1/sessions/:id/signal` existente, que continua sendo o
 *      fallback mantido (não é deletado por esta decisão).
 *
 * POST /api/v1/realtime/sessions/:id  — publica uma mensagem de signaling
 *      autorizada por participante + sessão ativa, delegando ao adapter
 *      `realtimeSignalingService` (que em Fase 1 roteia sobre o backbone poll).
 *
 * A autorização (participante + sessão ativa) é centralizada no adapter; este
 * route apenas injeta identidade (headers do middleware) e aplica rate limit,
 * espelhando o contrato do route poll legado.
 */

const MAX_PAYLOAD_BYTES = 10 * 1024 // 10 KB — mesmo limite do route poll

const RealtimeMessageSchema = z.object({
  type: z.enum(['offer', 'answer', 'candidate']),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string().optional(),
})

/** GET /api/v1/realtime/sessions/:id — negociação de transporte. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  const role = request.headers.get('x-user-role')
  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 })
  }
  const { id: sessionId } = await params

  const rl = await checkRateLimit(`realtime-get:${userId}`, RATE_LIMITS.SIGNAL_GET)
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Taxa de requisições excedida. Tente novamente.'),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  // Negociar exige autorização (participante + sessão ativa).
  const consume = await realtimeSignalingService.consume(
    sessionId,
    userId,
    role,
    request.nextUrl.searchParams.get('after') ?? undefined,
  )
  if (!consume.ok) {
    return NextResponse.json(apiResponse(null, consume.reason), { status: consume.status })
  }

  const descriptor = realtimeSignalingService.negotiate(sessionId)
  return NextResponse.json(
    apiResponse({ descriptor, messages: consume.messages }),
  )
}

/** POST /api/v1/realtime/sessions/:id — publica mensagem de signaling. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  const role = request.headers.get('x-user-role')
  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 })
  }
  const { id: sessionId } = await params

  const rl = await checkRateLimit(`realtime-post:${userId}`, RATE_LIMITS.SIGNAL_POST)
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Taxa de requisições excedida. Tente novamente.'),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(apiResponse(null, 'Payload excede limite de 10 KB.'), { status: 413 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 })
  }

  const parsed = RealtimeMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos: ' + parsed.error.issues[0].message),
      { status: 400 },
    )
  }

  // Prevenção de injeção: payload precisa ser objeto simples.
  if (typeof parsed.data.payload !== 'object' || Array.isArray(parsed.data.payload)) {
    return NextResponse.json(apiResponse(null, 'Payload deve ser um objeto.'), { status: 400 })
  }

  const result = await realtimeSignalingService.publish(sessionId, userId, role, {
    type: parsed.data.type as SignalType,
    payload: parsed.data.payload as SessionSignal['payload'],
    timestamp: parsed.data.timestamp ?? new Date().toISOString(),
  })

  if (!result.ok) {
    return NextResponse.json(apiResponse(null, result.reason), { status: result.status })
  }

  return NextResponse.json(apiResponse(null, null, 'Sinal registrado.'), { status: 201 })
}
