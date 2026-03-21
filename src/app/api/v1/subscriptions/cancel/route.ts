import { NextRequest, NextResponse } from 'next/server';
import { stripeService } from '@/services/stripe.service';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/subscriptions/cancel */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;

  try {
    // TODO: Implementar via /auto-flow execute
    // 1. Find subscription by userId
    // 2. stripeService.cancelSubscription(stripeSubscriptionId)
    // 3. Update Subscription.status = CANCELLED
    return NextResponse.json(
      apiResponse(null, 'Not implemented - run /auto-flow execute'),
      { status: 501 },
    );
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
