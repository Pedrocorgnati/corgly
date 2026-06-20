import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { AppError } from '@/lib/errors';
import { stripeService } from '@/services/stripe.service';

const WebhookStatusSchema = z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED']);

const ReplaySchema = z.object({
  eventId: z.string().trim().min(1),
});

/** GET /api/v1/admin/webhooks/stripe - lista eventos Stripe processados pelo webhook. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const statusParam = request.nextUrl.searchParams.get('status');
    const status = statusParam ? WebhookStatusSchema.safeParse(statusParam) : null;
    if (statusParam && !status?.success) {
      return NextResponse.json(apiResponse(null, 'Status inválido.', 'REQUEST_INVALID'), {
        status: 400,
      });
    }

    const list = await stripeService.listWebhookEvents(status?.data);
    return NextResponse.json(apiResponse(list));
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(apiResponse(null, error.message, error.code), { status: error.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/admin/webhooks/stripe - reprocessa com segurança um evento Stripe armazenado. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const parsed = ReplaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, parsed.error.issues[0]?.message ?? 'Payload inválido.', 'REQUEST_INVALID'),
        { status: 400 },
      );
    }

    const replay = await stripeService.replayWebhookEvent(parsed.data.eventId);
    const statusCode = replay.idempotentReplay ? 200 : 201;

    return NextResponse.json(
      apiResponse(
        replay,
        null,
        replay.idempotentReplay ? 'Evento já processado.' : 'Replay executado.',
      ),
      { status: statusCode },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(apiResponse(null, error.message, error.code), { status: error.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
