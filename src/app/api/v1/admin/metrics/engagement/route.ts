import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@/lib/constants/enums';
import { resolvePeriod, withMetricsCache } from '@/lib/admin-metrics/period';

/**
 * GET /api/v1/admin/metrics/engagement?period=7d|30d|90d|custom
 * Returns session counts by status, avg duration, and NPS-equivalent score from feedback.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { period, from, to } = resolvePeriod(searchParams);
    const cacheKey = `eng:${period}:${from.toISOString()}:${to.toISOString()}`;

    const data = await withMetricsCache(cacheKey, async () => {
      const [completed, cancelledStudent, cancelledAdmin, noshow, completedWithDuration, feedbackAgg] =
        await Promise.all([
          prisma.session.count({
            where: { status: SessionStatus.COMPLETED, completedAt: { gte: from, lte: to } },
          }),
          prisma.session.count({
            where: { status: SessionStatus.CANCELLED_BY_STUDENT, cancelledAt: { gte: from, lte: to } },
          }),
          prisma.session.count({
            where: { status: SessionStatus.CANCELLED_BY_ADMIN, cancelledAt: { gte: from, lte: to } },
          }),
          prisma.session.count({
            where: {
              status:  { in: [SessionStatus.NO_SHOW_STUDENT, SessionStatus.NO_SHOW_ADMIN] },
              startAt: { gte: from, lte: to },
            },
          }),
          prisma.session.findMany({
            where:  { status: SessionStatus.COMPLETED, completedAt: { gte: from, lte: to } },
            select: { startAt: true, completedAt: true, endAt: true },
            take:   500,
          }),
          prisma.feedback.aggregate({
            where: { createdAt: { gte: from, lte: to } },
            _avg:  {
              listeningScore:  true,
              speakingScore:   true,
              writingScore:    true,
              vocabularyScore: true,
            },
            _count: { _all: true },
          }),
        ]);

      const durations = completedWithDuration
        .map((s) => {
          const end = s.completedAt ?? s.endAt;
          return end && s.startAt ? (end.getTime() - s.startAt.getTime()) / 60000 : null;
        })
        .filter((n): n is number => n !== null && n > 0);
      const avgDurationMin = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      const avgs = feedbackAgg._avg;
      const scoreAvg = [avgs.listeningScore, avgs.speakingScore, avgs.writingScore, avgs.vocabularyScore]
        .filter((n): n is number => typeof n === 'number');
      const npsScore = scoreAvg.length ? scoreAvg.reduce((a, b) => a + b, 0) / scoreAvg.length : 0;

      return {
        period,
        from: from.toISOString(),
        to:   to.toISOString(),
        sessions: {
          completed,
          cancelledStudent,
          cancelledAdmin,
          noshow,
          total: completed + cancelledStudent + cancelledAdmin + noshow,
        },
        avgDurationMin: Number(avgDurationMin.toFixed(1)),
        feedback: {
          npsScore:   Number(npsScore.toFixed(2)),
          sampleSize: feedbackAgg._count._all,
          breakdown: {
            listening:  avgs.listeningScore,
            speaking:   avgs.speakingScore,
            writing:    avgs.writingScore,
            vocabulary: avgs.vocabularyScore,
          },
        },
      };
    });

    return NextResponse.json(apiResponse(data));
  } catch (err) {
    console.error('GET /admin/metrics/engagement', err);
    return NextResponse.json(apiResponse(null, 'Erro ao carregar metricas de engajamento.'), { status: 500 });
  }
}
