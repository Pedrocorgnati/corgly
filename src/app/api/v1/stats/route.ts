import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus, UserRole } from '@/lib/constants/enums';

/**
 * GET /api/v1/stats
 * Returns student statistics: total sessions, completion rate, streak (weeks).
 * Streak: consecutive weeks (Sun–Sat) with ≥1 COMPLETED session, counting back from current week.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const studentId = auth.role === UserRole.ADMIN && request.nextUrl.searchParams.get('studentId')
    ? request.nextUrl.searchParams.get('studentId')!
    : auth.id;

  try {
    const [totalSessions, completedSessions, cancelledSessions, allCompletedSessions] = await Promise.all([
      prisma.session.count({ where: { studentId } }),
      prisma.session.count({ where: { studentId, status: SessionStatus.COMPLETED } }),
      prisma.session.count({
        where: { studentId, status: { in: [SessionStatus.CANCELLED_BY_STUDENT, SessionStatus.CANCELLED_BY_ADMIN] } },
      }),
      prisma.session.findMany({
        where:  { studentId, status: SessionStatus.COMPLETED, completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    // Compute weekly streak (Sun=0 … Sat=6)
    const getWeekStart = (date: Date): number => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // set to Sunday
      return d.getTime();
    };

    const completedWeeks = new Set(
      allCompletedSessions.map((s) => getWeekStart(s.completedAt!)),
    );

    let currentStreak = 0;
    const now = new Date();
    let weekCursor = getWeekStart(now);

    while (completedWeeks.has(weekCursor)) {
      currentStreak++;
      weekCursor -= 7 * 24 * 60 * 60 * 1000; // go back one week
    }

    return NextResponse.json(apiResponse({
      totalSessions,
      completedSessions,
      cancelledSessions,
      currentStreak,
      completionRate: totalSessions > 0
        ? parseFloat(((completedSessions / totalSessions) * 100).toFixed(1))
        : 0,
    }));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
