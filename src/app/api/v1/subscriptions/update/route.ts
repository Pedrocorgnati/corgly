import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripeService } from '@/services/stripe.service';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { SubscriptionStatus } from '@/lib/constants/enums';
import {
  financialIdempotencyService,
  resolveRequestIdempotencyKey,
} from '@/lib/billing/idempotency.service';

const UpdateSubscriptionSchema = z.object({
  weeklyFrequency: z.number().int().min(1).max(5, {
    message: 'Frequência deve estar entre 1 e 5 aulas por semana.',
  }),
  prorationDate: z.number().int().positive().optional(),
});

/** POST /api/v1/subscriptions/update — atualizar frequência semanal da assinatura */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 });
    }

    const parsed = UpdateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    // Localizar assinatura ativa
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] } },
    });

    if (!subscription) {
      return NextResponse.json(
        apiResponse(null, 'Nenhuma assinatura ativa encontrada.'),
        { status: 404 },
      );
    }

    const clientKey = resolveRequestIdempotencyKey(request.headers);

    const { result: updated, idempotentReplay } = await financialIdempotencyService.run(
      'subscription_update',
      userId,
      clientKey,
      {
        userId,
        subscriptionId: subscription.id,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        weeklyFrequency: parsed.data.weeklyFrequency,
        prorationDate: parsed.data.prorationDate,
      },
      async (idempotencyKey) => {
        const updateOptions = parsed.data.prorationDate
          ? { prorationDate: parsed.data.prorationDate }
          : undefined;

        if (updateOptions) {
          await stripeService.updateSubscription(
            subscription.stripeSubscriptionId,
            parsed.data.weeklyFrequency,
            idempotencyKey,
            updateOptions,
          );
        } else {
          await stripeService.updateSubscription(
            subscription.stripeSubscriptionId,
            parsed.data.weeklyFrequency,
            idempotencyKey,
          );
        }

        return prisma.subscription.findUnique({ where: { id: subscription.id } });
      },
    );

    return NextResponse.json(
      apiResponse(
        { subscription: updated, idempotentReplay },
        null,
        idempotentReplay
          ? 'Frequência atualizada anteriormente para esta Idempotency-Key.'
          : 'Frequência atualizada com sucesso.',
      ),
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
