import { NextRequest, NextResponse } from 'next/server';
import { stripeService } from '@/services/stripe.service';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { SubscriptionStatus } from '@/lib/constants/enums';

/** POST /api/v1/subscriptions/cancel — cancelar assinatura ativa ao final do período */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  try {
    // Localizar assinatura ativa
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE] } },
    });

    if (!subscription) {
      return NextResponse.json(
        apiResponse(null, 'Nenhuma assinatura ativa encontrada.'),
        { status: 404 },
      );
    }

    // Cancelar no Stripe (cancel_at_period_end: true)
    await stripeService.cancelSubscription(subscription.stripeSubscriptionId);

    // Marcar no banco — o webhook customer.subscription.deleted vai atualizar para CANCELLED
    // Por ora, mantemos ACTIVE mas com flag via Stripe
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelledAt: new Date() },
    });

    return NextResponse.json(
      apiResponse(
        { subscriptionId: updated.id, currentPeriodEnd: updated.currentPeriodEnd },
        null,
        'Assinatura cancelada. Válida até o fim do período atual.',
      ),
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
