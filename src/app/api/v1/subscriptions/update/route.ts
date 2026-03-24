import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripeService } from '@/services/stripe.service';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { SubscriptionStatus } from '@/lib/constants/enums';

const UpdateSubscriptionSchema = z.object({
  weeklyFrequency: z.number().int().min(1).max(5, {
    message: 'Frequência deve estar entre 1 e 5 aulas por semana.',
  }),
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

    await stripeService.updateSubscription(
      subscription.stripeSubscriptionId,
      parsed.data.weeklyFrequency,
    );

    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });

    return NextResponse.json(
      apiResponse(updated, null, 'Frequência atualizada com sucesso.'),
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
