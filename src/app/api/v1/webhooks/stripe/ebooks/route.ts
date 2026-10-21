import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import {
  EBOOK_TOKEN_REVOKE_ON_DISPUTE,
  EBOOK_TOKEN_REVOKE_ON_REFUND,
  getEbookWebhookPorts,
  handleEbookWebhookRequest,
} from '@/lib/ebooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook dedicado dos ebooks (D-B1, D-B4). A rota so faz rate limit, le o
 * corpo bruto uma vez via `arrayBuffer` (a assinatura da Stripe e verificada
 * sobre esses bytes) e mapeia o resultado do nucleo em resposta. O trabalho
 * pesado vai para `after`, depois do 2xx.
 *
 * Sem `export const config`: mesmo motivo da rota irma
 * `src/app/api/v1/webhooks/stripe/route.ts` (campo de Pages Router, recusado
 * pelo Turbopack em build).
 */

/** POST /api/v1/webhooks/stripe/ebooks */
export const POST = withApiHandler(async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = await checkRateLimit(`webhook:${ip}`, RATE_LIMITS.WEBHOOK);
  if (!rl.allowed) {
    return NextResponse.json(apiResponse(null, 'Rate limit exceeded.'), { status: 429 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('stripe-signature');
  const contentLength = request.headers.get('content-length');

  const result = await handleEbookWebhookRequest(
    { rawBody, signature, contentLength },
    {
      prisma,
      stripe: getStripe(),
      // String vazia conta como ausente: o nucleo devolve 503.
      secret: process.env.STRIPE_EBOOKS_WEBHOOK_SECRET || undefined,
      ports: getEbookWebhookPorts(),
      schedule: after,
      now: () => new Date(),
      config: {
        revokeOnRefund: EBOOK_TOKEN_REVOKE_ON_REFUND,
        revokeOnDispute: EBOOK_TOKEN_REVOKE_ON_DISPUTE,
      },
    },
  );

  return NextResponse.json(result.body, { status: result.status });
});
