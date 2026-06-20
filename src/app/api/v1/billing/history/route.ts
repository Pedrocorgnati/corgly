import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PaymentStatus, Prisma } from '@prisma/client';

/**
 * GET /api/v1/billing/history
 *
 * Retorna extrato financeiro paginado (cursor-based) do usuario autenticado.
 *
 * Query params:
 *  - cursor (string, optional): id do ultimo payment da pagina anterior
 *  - limit (number, 1..50, default 20)
 *  - status (PENDING|SUCCEEDED|FAILED|REFUNDED, optional)
 *  - from (ISO date, optional)
 *  - to   (ISO date, optional)
 *
 * Response:
 *  { items: PaymentHistoryItem[], nextCursor: string|null }
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get('cursor') || undefined;
  const rawLimit = Number(searchParams.get('limit') || '20');
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20), 50);
  const statusParam = searchParams.get('status') || undefined;
  const fromParam = searchParams.get('from') || undefined;
  const toParam = searchParams.get('to') || undefined;

  // Validate status
  let status: PaymentStatus | undefined;
  if (statusParam) {
    if (!(statusParam in PaymentStatus)) {
      return NextResponse.json(apiResponse(null, 'status invalido'), { status: 400 });
    }
    status = statusParam as PaymentStatus;
  }

  const where: Prisma.PaymentWhereInput = { userId };
  if (status) where.status = status;
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) {
      const d = new Date(fromParam);
      if (isNaN(d.getTime())) {
        return NextResponse.json(apiResponse(null, 'from invalido'), { status: 400 });
      }
      (where.createdAt as Prisma.DateTimeFilter).gte = d;
    }
    if (toParam) {
      const d = new Date(toParam);
      if (isNaN(d.getTime())) {
        return NextResponse.json(apiResponse(null, 'to invalido'), { status: 400 });
      }
      (where.createdAt as Prisma.DateTimeFilter).lte = d;
    }
  }

  try {
    const items = await prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        stripePaymentIntentId: true,
        creditBatch: { select: { id: true, credits: true } },
      },
    });

    const hasNext = items.length > limit;
    const page = hasNext ? items.slice(0, limit) : items;
    const nextCursor = hasNext ? page[page.length - 1].id : null;

    const mapped = page.map((p) => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      description:
        p.creditBatch && p.creditBatch.credits
          ? `Compra de ${p.creditBatch.credits} crédito(s)`
          : 'Pagamento',
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      receiptAvailable: p.status === PaymentStatus.SUCCEEDED,
      refundEligible:
        p.status === PaymentStatus.SUCCEEDED && Boolean(p.stripePaymentIntentId?.trim()),
    }));

    return NextResponse.json(apiResponse({ items: mapped, nextCursor }));
  } catch (err) {
    logger.error(
      'GET /api/v1/billing/history',
      { action: 'billing.history.get', userId },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
