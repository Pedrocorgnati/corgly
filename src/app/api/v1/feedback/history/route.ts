import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { feedbackService } from '@/services/feedback.service';

/**
 * GET /api/v1/feedback/history?period=30d|90d|all&page=1&limit=20&format=csv
 * Returns paginated feedback history for charts on the /progress page.
 * format=csv: returns CSV attachment with all sessions in the period.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const period = (searchParams.get('period') ?? 'all') as '30d' | '90d' | 'all';
  const format = searchParams.get('format');
  const page   = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)));

  // Admin can query any student via ?studentId=
  const studentId =
    auth.role === UserRole.ADMIN && searchParams.get('studentId')
      ? searchParams.get('studentId')!
      : auth.id;

  try {
    const { items, total } = await feedbackService.getHistory(studentId, period, page, limit);

    if (format === 'csv') {
      const header = 'Data,Claridade,Didática,Pontualidade,Engajamento,Média,Comentário\n';
      const rows   = items.map((f) => {
        const avg = (f.scores.clarity + f.scores.didactics + f.scores.punctuality + f.scores.engagement) / 4;
        const date = f.sessionDate.toISOString().split('T')[0];
        const comment = (f.comment ?? '').replace(/"/g, '""');
        return `${date},${f.scores.clarity},${f.scores.didactics},${f.scores.punctuality},${f.scores.engagement},${avg.toFixed(2)},"${comment}"`;
      });
      const csv = header + rows.join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=feedback-history.csv',
        },
      });
    }

    return NextResponse.json(apiResponse({ items, total, page, limit }));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
