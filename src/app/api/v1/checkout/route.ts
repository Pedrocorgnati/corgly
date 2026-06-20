import { NextRequest, NextResponse } from 'next/server';
import {
  CreateCheckoutSchema,
  CreateSubscriptionCheckoutSchema,
} from '@/schemas/checkout.schema';
import { checkoutService } from '@/lib/billing/checkout.service';
import { authService } from '@/services/auth.service';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';

/**
 * POST /api/v1/checkout
 *
 * Idempotente (T-028 / §12.4.1): aceita o header `Idempotency-Key`. Quando
 * ausente, uma chave determinística rastreável por usuário + pacote é gerada.
 * Repetição dentro da janela retorna a mesma Stripe Checkout Session.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireStudent(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  // Rate limit: 10 req/min por userId
  const rl = await checkRateLimit(`checkout:${userId}`, { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(apiResponse(null, 'Muitas requisições. Tente novamente em breve.'), { status: 429 });
  }

  // Idempotency-Key opcional do cliente (header canônico).
  const clientKey = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key');

  try {
    const body = await request.json();
    const { packageType, weeklyFrequency, isSubscription, currency } = body;

    if (isSubscription) {
      const parsed = CreateSubscriptionCheckoutSchema.safeParse({ weeklyFrequency, currency });
      if (!parsed.success) {
        return NextResponse.json(
          apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
          { status: 400 },
        );
      }
      const result = await checkoutService.createSubscriptionCheckout(userId, parsed.data, clientKey);
      return NextResponse.json(apiResponse(result));
    }

    const parsed = CreateCheckoutSchema.safeParse({ packageType, currency });
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const user = await authService.getMe(userId);
    const isFirstPurchase = (user as { isFirstPurchase?: boolean } | null)?.isFirstPurchase ?? false;
    const result = await checkoutService.createOneTimeCheckout(userId, isFirstPurchase, parsed.data, clientKey);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
