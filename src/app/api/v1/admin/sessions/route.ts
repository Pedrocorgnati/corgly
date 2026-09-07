import { NextRequest, NextResponse } from 'next/server';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';

/** Teto de itens por pagina — mesmo do `GET /api/v1/sessions`. */
const MAX_PAGE_SIZE = 100;

/**
 * Inteiro positivo vindo da querystring, com piso, teto e fallback.
 * `Number('abc')` e NaN e `Number('-3')` e negativo; os dois viravam
 * `skip`/`take` invalidos no Prisma e a rota respondia 500 sem dizer o motivo
 * (a tela, por sua vez, mostrava "nenhuma sessao encontrada").
 */
function positiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

/**
 * GET /api/v1/admin/sessions?status=X&hasFeedback=false&page=1&limit=20
 *
 * Devolve `AdminSessionRow[]` (src/services/session.service.ts): o
 * `SessionWithMeta` de sempre MAIS `studentName` e `score`, que sao as colunas
 * "Aluno" e "Score" da tabela do console admin.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  // `listAllForAdmin` recebe `status?: SessionStatus` (enum do Prisma). A querystring e
  // string livre, entao valor fora do enum e ignorado em vez de virar filtro invalido,
  // mesmo comportamento de `GET /api/v1/sessions`.
  const rawStatus = searchParams.get('status');
  const status =
    rawStatus && Object.values(PrismaSessionStatus).includes(rawStatus as PrismaSessionStatus)
      ? (rawStatus as PrismaSessionStatus)
      : undefined;

  // `hasFeedback` e um TERNARIO na pratica: ausente (todas), `true` (so aulas ja
  // avaliadas) e `false` (so aulas pendentes de avaliacao). Antes, qualquer
  // texto diferente de "true" — inclusive `hasFeedback=1` ou um typo — virava
  // `false` e a tela passava a esconder metade das aulas sem avisar ninguem.
  const rawHasFeedback = searchParams.get('hasFeedback');
  if (rawHasFeedback !== null && rawHasFeedback !== 'true' && rawHasFeedback !== 'false') {
    return NextResponse.json(
      apiResponse(null, 'Filtro de feedback inválido.', 'Valores aceitos: true, false.'),
      { status: 400 },
    );
  }
  const hasFeedback = rawHasFeedback === null ? undefined : rawHasFeedback === 'true';

  const page = positiveInt(searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
  const limit = positiveInt(searchParams.get('limit'), 20, MAX_PAGE_SIZE);

  try {
    const result = await sessionService.listAllForAdmin({ status, hasFeedback, page, limit });
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    // Sem este log a falha sumia: o `catch {}` anterior devolvia 500 generico e
    // nao deixava rastro de qual consulta quebrou.
    logger.error(
      'GET /api/v1/admin/sessions',
      { action: 'admin.sessions.list', route: '/api/v1/admin/sessions' },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
