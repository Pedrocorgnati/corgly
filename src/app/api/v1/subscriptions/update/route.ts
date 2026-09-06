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
import { MonthlyLessonsEnum } from '@/schemas/checkout.schema';
import type { SubscriptionPlanUpdate } from '@/services/stripe.service';

/**
 * Dois eixos mutuamente exclusivos, exatamente como no checkout:
 *  - `monthlyLessons` (canonico): 10 ou 20 aulas por mes;
 *  - `weeklyFrequency` (legado): 1 a 5 aulas por semana.
 *
 * Enviar os dois deixaria o preco ambiguo; nao enviar nenhum nao precifica nada.
 */
const UpdateSubscriptionSchema = z
  .object({
    monthlyLessons: MonthlyLessonsEnum.optional(),
    weeklyFrequency: z
      .number()
      .int()
      .min(1)
      .max(5, { message: 'Frequência deve estar entre 1 e 5 aulas por semana.' })
      .optional(),
    prorationDate: z.number().int().positive().optional(),
  })
  .refine(
    (data) => (data.monthlyLessons !== undefined) !== (data.weeklyFrequency !== undefined),
    {
      message:
        'Informe exatamente um eixo: monthlyLessons (10 ou 20 aulas por mes) ou weeklyFrequency (1 a 5 aulas por semana).',
      path: ['monthlyLessons'],
    },
  );

/** POST /api/v1/subscriptions/update — trocar o plano da assinatura ativa */
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

    // `plan` no formato aceito por stripeService.updateSubscription: numero cru
    // no eixo legado (assinatura de contrato antigo), objeto no eixo canonico.
    const plan: number | SubscriptionPlanUpdate =
      parsed.data.monthlyLessons !== undefined
        ? { monthlyLessons: parsed.data.monthlyLessons }
        : (parsed.data.weeklyFrequency as number);

    const { result: updated, idempotentReplay } = await financialIdempotencyService.run(
      'subscription_update',
      userId,
      clientKey,
      {
        userId,
        subscriptionId: subscription.id,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        weeklyFrequency: parsed.data.weeklyFrequency,
        monthlyLessons: parsed.data.monthlyLessons,
        prorationDate: parsed.data.prorationDate,
      },
      async (idempotencyKey) => {
        const updateOptions = parsed.data.prorationDate
          ? { prorationDate: parsed.data.prorationDate }
          : undefined;

        if (updateOptions) {
          await stripeService.updateSubscription(
            subscription.stripeSubscriptionId,
            plan,
            idempotencyKey,
            updateOptions,
          );
        } else {
          await stripeService.updateSubscription(
            subscription.stripeSubscriptionId,
            plan,
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
          ? 'Plano atualizado anteriormente para esta Idempotency-Key.'
          : 'Plano atualizado com sucesso.',
      ),
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
