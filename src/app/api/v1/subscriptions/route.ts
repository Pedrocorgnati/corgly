import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { SubscriptionStatus } from '@/lib/constants/enums';

/** GET /api/v1/subscriptions — retorna assinatura ativa do usuário (ou null) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE] } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(apiResponse(subscription));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
