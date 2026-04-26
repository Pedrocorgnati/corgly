import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolvePeriod, withMetricsCache } from '@/lib/admin-metrics/period';

/**
 * GET /api/v1/admin/metrics/financials?period=7d|30d|90d|custom&from=&to=
 * Returns revenue (by currency), MRR, churn rate for the period.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { period, from, to, previousFrom, previousTo } = resolvePeriod(searchParams);
    const cacheKey = `fin:${period}:${from.toISOString()}:${to.toISOString()}`;

    const data = await withMetricsCache(cacheKey, async () => {
      const [paymentsGrouped, prevPaymentsGrouped, activeSubs, cancelledInPeriod, activeAtPeriodStart] =
        await Promise.all([
          prisma.payment.groupBy({
            by:     ['currency'],
            where:  { status: 'SUCCEEDED', createdAt: { gte: from, lte: to } },
            _sum:   { amount: true },
            _count: { _all: true },
          }),
          prisma.payment.groupBy({
            by:    ['currency'],
            where: { status: 'SUCCEEDED', createdAt: { gte: previousFrom, lte: previousTo } },
            _sum:  { amount: true },
          }),
          prisma.subscription.count({ where: { status: 'ACTIVE' } }),
          prisma.subscription.count({
            where: { status: 'CANCELLED', cancelledAt: { gte: from, lte: to } },
          }),
          prisma.subscription.count({
            where: {
              createdAt: { lte: from },
              OR:        [{ cancelledAt: null }, { cancelledAt: { gte: from } }],
            },
          }),
        ]);

      const revenue = paymentsGrouped.map((r) => ({
        currency: r.currency,
        amount:   r._sum.amount ?? 0,
        count:    r._count._all,
      }));
      const prevRevenue = prevPaymentsGrouped.reduce<Record<string, number>>((acc, r) => {
        acc[r.currency] = r._sum.amount ?? 0;
        return acc;
      }, {});
      const revenueDelta = revenue.map((r) => {
        const prev = prevRevenue[r.currency] ?? 0;
        return {
          currency: r.currency,
          delta:    prev === 0 ? null : ((r.amount - prev) / prev) * 100,
        };
      });

      const churnRate = activeAtPeriodStart > 0 ? (cancelledInPeriod / activeAtPeriodStart) * 100 : 0;

      return {
        period,
        from:     from.toISOString(),
        to:       to.toISOString(),
        revenue,
        revenueDelta,
        mrr:      activeSubs,
        churnRate: Number(churnRate.toFixed(2)),
        subscriptions: {
          active:             activeSubs,
          cancelledInPeriod,
          activeAtPeriodStart,
        },
      };
    });

    return NextResponse.json(apiResponse(data));
  } catch (err) {
    console.error('GET /admin/metrics/financials', err);
    return NextResponse.json(apiResponse(null, 'Erro ao carregar metricas financeiras.'), { status: 500 });
  }
}
