import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { feedbackService } from '@/services/feedback.service';

/**
 * Teto de linhas do export CSV. O `limit` da paginacao (20) nao vale aqui: um
 * CSV pedido com `period=all` que devolvesse so a primeira pagina seria uma
 * mentira silenciosa. Uma avaliacao por sessao torna este teto inalcancavel na
 * pratica; se um dia for atingido, o cabecalho `X-Total-Rows` denuncia o corte.
 */
const CSV_MAX_ROWS = 5000;

/** Cabecalho do CSV no vocabulario canonico das dimensoes (schema.prisma:Feedback). */
const CSV_HEADER = 'Data,Escuta,Fala,Escrita,Vocabulário,Média,Comentário\n';

/** Numero ausente ou nao-finito vira celula vazia — nunca `NaN` no arquivo. */
function csvNumber(value: unknown, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '';
}

/** Data invalida vira celula vazia em vez de `Invalid Date`. */
function csvDate(value: Date): string {
  const time = value instanceof Date ? value.getTime() : NaN;
  if (Number.isNaN(time)) return '';
  return value.toISOString().split('T')[0] ?? '';
}

/** Texto livre sempre entre aspas, com aspas internas duplicadas (RFC 4180). */
function csvText(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

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
    if (format === 'csv') {
      // O CSV exporta o periodo inteiro, nao a pagina corrente.
      const { items, total } = await feedbackService.getHistory(studentId, period, 1, CSV_MAX_ROWS);

      const rows = items.map((f) => {
        const cells = [
          csvDate(f.sessionDate),
          csvNumber(f.scores.listening),
          csvNumber(f.scores.speaking),
          csvNumber(f.scores.writing),
          csvNumber(f.scores.vocabulary),
          csvNumber(f.averageScore, 2),
          csvText(f.overallFeedback),
        ];
        return cells.join(',');
      });
      const csv = CSV_HEADER + rows.join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=feedback-history.csv',
          'X-Total-Rows':        String(total),
          'X-Exported-Rows':     String(items.length),
        },
      });
    }

    const { items, total } = await feedbackService.getHistory(studentId, period, page, limit);

    return NextResponse.json(apiResponse({ items, total, page, limit }));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
