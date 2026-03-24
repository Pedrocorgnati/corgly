import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** GET /api/v1/payments — histórico de pagamentos do usuário autenticado, paginado */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  const { searchParams } = request.nextUrl;

  // Admin pode consultar qualquer usuário via ?userId=
  const targetUserId =
    authResult.role === UserRole.ADMIN && searchParams.get('userId') ? searchParams.get('userId')! : userId;

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
  const skip = (page - 1) * limit;

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          creditBatchId: true,
          stripePaymentIntentId: true,
        },
      }),
      prisma.payment.count({ where: { userId: targetUserId } }),
    ]);

    return NextResponse.json(
      apiResponse({
        payments,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/payments', { action: 'payments.list', userId: targetUserId }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
