import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus, UserRole } from '@/lib/constants/enums';
import { PAGINATION } from '@/lib/constants';

/**
 * GET /api/v1/admin/dashboard
 * Returns admin dashboard data: today's sessions by status, pending feedbacks,
 * expiring credits (< 7 days), total active students.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [
      todayScheduled,
      todayInProgress,
      todayCompleted,
      todayCancelled,
      pendingFeedbacks,
      expiringCreditBatches,
      totalStudents,
    ] = await Promise.all([
      prisma.session.count({
        where: { startAt: { gte: todayStart, lte: todayEnd }, status: SessionStatus.SCHEDULED },
      }),
      prisma.session.count({
        where: { startAt: { gte: todayStart, lte: todayEnd }, status: SessionStatus.IN_PROGRESS },
      }),
      prisma.session.count({
        where: { startAt: { gte: todayStart, lte: todayEnd }, status: SessionStatus.COMPLETED },
      }),
      prisma.session.count({
        where: {
          startAt: { gte: todayStart, lte: todayEnd },
          status:  { in: [SessionStatus.CANCELLED_BY_STUDENT, SessionStatus.CANCELLED_BY_ADMIN] },
        },
      }),
      // Sessions COMPLETED in last 48h without feedback
      prisma.session.findMany({
        where: {
          status:      SessionStatus.COMPLETED,
          completedAt: { gte: fortyEightHoursAgo },
          feedback:    null,
        },
        select: {
          id:          true,
          completedAt: true,
          startAt:     true,
          student:     { select: { id: true, name: true, email: true } },
        },
        orderBy: { completedAt: 'desc' },
        take:    PAGINATION.DASHBOARD_RECENT,
      }),
      // Credit batches expiring within 7 days (filter remaining > 0 in JS)
      prisma.creditBatch.findMany({
        where: {
          expiresAt: { lte: sevenDaysFromNow, gte: new Date() },
        },
        select: {
          id:           true,
          userId:       true,
          expiresAt:    true,
          totalCredits: true,
          usedCredits:  true,
          user:         { select: { id: true, name: true, email: true } },
        },
        orderBy: { expiresAt: 'asc' },
        take:    PAGINATION.DASHBOARD_UPCOMING,
      }),
      prisma.user.count({ where: { role: UserRole.STUDENT } }),
    ]);

    return NextResponse.json(apiResponse({
      today: {
        scheduled:   todayScheduled,
        inProgress:  todayInProgress,
        completed:   todayCompleted,
        cancelled:   todayCancelled,
      },
      pendingFeedbacks: {
        count: pendingFeedbacks.length,
        items: pendingFeedbacks.slice(0, 3).map((s) => ({
          sessionId:   s.id,
          completedAt: s.completedAt,
          sessionDate: s.startAt,
          student:     s.student,
        })),
      },
      expiringCredits: {
        count: expiringCreditBatches.filter((b) => b.usedCredits < b.totalCredits).length,
        items: expiringCreditBatches.filter((b) => b.usedCredits < b.totalCredits).slice(0, 20).map((b) => ({
          batchId:         b.id,
          userId:          b.userId,
          student:         b.user,
          remaining:       b.totalCredits - b.usedCredits,
          expiresAt:       b.expiresAt,
          daysUntilExpiry: b.expiresAt
            ? Math.ceil((b.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null,
        })),
      },
      totalStudents,
    }));
  } catch (err) {
    console.error('GET /admin/dashboard', err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
