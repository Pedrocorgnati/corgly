import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/constants/enums';
import { resolvePeriod, withMetricsCache } from '@/lib/admin-metrics/period';

/**
 * GET /api/v1/admin/metrics/users?period=7d|30d|90d|custom
 * Returns DAU/WAU/MAU (based on lastLoginAt), new signups, retention.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { period, from, to } = resolvePeriod(searchParams);
    const cacheKey = `usr:${period}:${from.toISOString()}:${to.toISOString()}`;

    const data = await withMetricsCache(cacheKey, async () => {
      const now = new Date();
      const d1 = new Date(now.getTime() - 86400000);
      const d7 = new Date(now.getTime() - 7 * 86400000);
      const d30 = new Date(now.getTime() - 30 * 86400000);

      const [dau, wau, mau, newSignups, totalStudents, usersWithSessions] = await Promise.all([
        prisma.user.count({ where: { role: UserRole.STUDENT, lastLoginAt: { gte: d1 } } }),
        prisma.user.count({ where: { role: UserRole.STUDENT, lastLoginAt: { gte: d7 } } }),
        prisma.user.count({ where: { role: UserRole.STUDENT, lastLoginAt: { gte: d30 } } }),
        prisma.user.count({
          where: { role: UserRole.STUDENT, createdAt: { gte: from, lte: to } },
        }),
        prisma.user.count({ where: { role: UserRole.STUDENT } }),
        prisma.session.groupBy({
          by:     ['studentId'],
          where:  { status: 'COMPLETED', startAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
      ]);

      const returningStudents = usersWithSessions.filter((u) => u._count._all >= 2).length;
      const retentionRate = totalStudents > 0 ? (returningStudents / totalStudents) * 100 : 0;

      return {
        period,
        from:      from.toISOString(),
        to:        to.toISOString(),
        activeUsers: { dau, wau, mau },
        newSignups,
        totalStudents,
        retentionRate: Number(retentionRate.toFixed(2)),
        returningStudents,
      };
    });

    return NextResponse.json(apiResponse(data));
  } catch (err) {
    console.error('GET /admin/metrics/users', err);
    return NextResponse.json(apiResponse(null, 'Erro ao carregar metricas de usuarios.'), { status: 500 });
  }
}
