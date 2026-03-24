import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@/lib/constants/enums';
import { PAGINATION } from '@/lib/constants';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/admin/users/[id]
 * Returns complete student profile: info, credit summary, session history, feedback progress.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id: studentId } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id:                  true,
        name:                true,
        email:               true,
        country:             true,
        timezone:            true,
        emailConfirmed:      true,
        marketingOptIn:      true,
        preferredLanguage:   true,
        onboardingCompletedAt: true,
        createdAt:           true,
        lastLoginAt:         true,
        deletionRequestedAt: true,
      },
    });

    if (!user || user.id === undefined) {
      return NextResponse.json(apiResponse(null, 'Usuário não encontrado.'), { status: 404 });
    }

    const [sessionCounts, creditBatches, recentSessions, recentFeedbacks] = await Promise.all([
      prisma.session.groupBy({
        by:    ['status'],
        where: { studentId },
        _count: { status: true },
      }),
      prisma.creditBatch.findMany({
        where:   { userId: studentId },
        select:  { id: true, type: true, totalCredits: true, usedCredits: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_PAYMENTS,
      }),
      prisma.session.findMany({
        where:   { studentId },
        select:  { id: true, status: true, startAt: true, completedAt: true, feedback: { select: { clarityScore: true, didacticsScore: true, punctualityScore: true, engagementScore: true } } },
        orderBy: { startAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_SESSIONS,
      }),
      prisma.feedback.findMany({
        where:   { session: { studentId } },
        select:  { id: true, clarityScore: true, didacticsScore: true, punctualityScore: true, engagementScore: true, comment: true, reviewed: true, reviewedAt: true, createdAt: true, session: { select: { startAt: true } } },
        orderBy: { createdAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_TOP_SESSIONS,
      }),
    ]);

    // Compute credit balance
    const creditBalance = creditBatches
      .filter((b) => !b.expiresAt || b.expiresAt > new Date())
      .reduce((s, b) => s + (b.totalCredits - b.usedCredits), 0);

    // Session counts by status
    const sessionStats: Record<string, number> = {};
    for (const g of sessionCounts) {
      sessionStats[g.status] = g._count.status;
    }

    return NextResponse.json(apiResponse({
      user,
      stats: {
        creditBalance,
        totalSessions:     Object.values(sessionStats).reduce((a, b) => a + b, 0),
        completedSessions: sessionStats[SessionStatus.COMPLETED] ?? 0,
        cancelledSessions: (sessionStats[SessionStatus.CANCELLED_BY_STUDENT] ?? 0) + (sessionStats[SessionStatus.CANCELLED_BY_ADMIN] ?? 0),
      },
      creditBatches,
      recentSessions: recentSessions.map((s) => ({
        id:          s.id,
        status:      s.status,
        startAt:     s.startAt,
        completedAt: s.completedAt,
        hasFeedback: !!s.feedback,
      })),
      recentFeedbacks: recentFeedbacks.map((f) => ({
        id:           f.id,
        sessionDate:  f.session.startAt,
        averageScore: (f.clarityScore + f.didacticsScore + f.punctualityScore + f.engagementScore) / 4,
        reviewed:     f.reviewed,
        reviewedAt:   f.reviewedAt,
        createdAt:    f.createdAt,
      })),
    }));
  } catch (err) {
    console.error('GET /admin/users/[id]', err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
