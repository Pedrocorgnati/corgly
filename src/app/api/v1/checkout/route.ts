import { NextRequest, NextResponse } from 'next/server';
import {
  CreateCheckoutSchema,
  CreateSubscriptionCheckoutSchema,
} from '@/schemas/checkout.schema';
import { stripeService } from '@/services/stripe.service';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/checkout */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;

  try {
    const body = await request.json();
    const { packageType, weeklyFrequency, isSubscription } = body;

    if (isSubscription) {
      const parsed = CreateSubscriptionCheckoutSchema.safeParse({ weeklyFrequency });
      if (!parsed.success) {
        return NextResponse.json(
          apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
          { status: 400 },
        );
      }
      const result = await stripeService.createSubscriptionCheckout(userId, parsed.data);
      return NextResponse.json(apiResponse(result));
    }

    const parsed = CreateCheckoutSchema.safeParse({ packageType });
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const user = await authService.getMe(userId);
    const isFirstPurchase = (user as { isFirstPurchase?: boolean } | null)?.isFirstPurchase ?? false;
    const result = await stripeService.createCheckoutSession(userId, isFirstPurchase, parsed.data);
    return NextResponse.json(apiResponse(result));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
