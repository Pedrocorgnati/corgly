import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { clientSessionHealthEventSchema } from '@/lib/sessions/session-health.schema';
import {
  authorizeSessionHealth,
  getSessionHealthSummary,
  recordSessionHealthEvents,
  MAX_HEALTH_EVENTS_PER_REQUEST,
} from '@/lib/sessions/session-health.service';

/**
 * Eventos de health da sessao WebRTC (T-026, PRD §12.4.1 / §12.4.4).
 *
 * POST /api/v1/sessions/:id/health-events
 *   Cliente envia, em lote, eventos JA normalizados de latencia/jitter/packet
 *   loss/estado/reconnect. O `sessionId` autoritativo vem do path; qualquer
 *   `sessionId` no corpo do evento e ignorado (Zero Assumido). O endpoint agrega
 *   sem persistir payload excessivo (metadata truncada no service) e responde
 *   com o estado derivado atual.
 *
 * GET /api/v1/sessions/:id/health-events
 *   Retorna o estado agregado atual (connectionState + quality + metricas) que
 *   o `ConnectionIndicator` consome.
 *
 * Status codes (ambos): 401 nao autenticado, 403 nao participante / sessao
 *   nao ativa, 404 sessao nao encontrada, 400 corpo invalido (POST), 500 erro.
 */

/** No maximo `MAX_HEALTH_EVENTS_PER_REQUEST` eventos por request. */
const healthEventsBodySchema = z.object({
  events: z
    .array(z.unknown())
    .min(1, 'Informe ao menos um evento')
    .max(MAX_HEALTH_EVENTS_PER_REQUEST, 'Lote de eventos excede o limite'),
});

function denyMessage(status: 403 | 404): string {
  return status === 404 ? 'Sessão não encontrada.' : 'Acesso negado.';
}

export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id: sessionId } = await params;

  const authz = await authorizeSessionHealth({
    sessionId,
    userId: auth.id,
    role: auth.role,
  });
  if (!authz.ok) {
    return NextResponse.json(apiResponse(null, denyMessage(authz.status)), {
      status: authz.status,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      apiResponse(null, 'Corpo inválido.', 'JSON malformado'),
      { status: 400 },
    );
  }

  const parsedBody = healthEventsBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsedBody.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  // Injeta o sessionId autoritativo do path em cada evento antes de normalizar.
  const normalized: z.infer<typeof clientSessionHealthEventSchema>[] = [];
  for (const [index, raw] of parsedBody.data.events.entries()) {
    const candidate =
      raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>), sessionId } : raw;
    const parsedEvent = clientSessionHealthEventSchema.safeParse(candidate);
    if (!parsedEvent.success) {
      return NextResponse.json(
        apiResponse(
          null,
          'Evento inválido.',
          `events[${index}]: ${parsedEvent.error.issues[0]?.message ?? 'formato inválido'}`,
        ),
        { status: 400 },
      );
    }
    normalized.push(parsedEvent.data);
  }

  try {
    const { recorded, summary } = await recordSessionHealthEvents({
      sessionId,
      events: normalized,
    });
    return NextResponse.json(apiResponse({ recorded, summary }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'session_health.error',
        sessionId,
        userId: auth.id,
        reason: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return NextResponse.json(
      apiResponse(null, 'Falha ao registrar eventos de conexão.'),
      { status: 500 },
    );
  }
});

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id: sessionId } = await params;

  const authz = await authorizeSessionHealth({
    sessionId,
    userId: auth.id,
    role: auth.role,
  });
  if (!authz.ok) {
    return NextResponse.json(apiResponse(null, denyMessage(authz.status)), {
      status: authz.status,
    });
  }

  try {
    const summary = await getSessionHealthSummary(sessionId);
    return NextResponse.json(apiResponse(summary));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'session_health.error',
        sessionId,
        userId: auth.id,
        reason: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return NextResponse.json(
      apiResponse(null, 'Falha ao obter estado de conexão.'),
      { status: 500 },
    );
  }
});
