/**
 * GET  /api/v1/admin/exercises/[id]/assignments - quem tem o exercicio liberado
 * POST /api/v1/admin/exercises/[id]/assignments - libera para uma lista de alunos
 *
 * Este POST e a UNICA rota do dominio que devolve `err.details` no campo `data`
 * do envelope. A selecao e tudo-ou-nada: quando ela e recusada, o admin precisa
 * saber QUAIS ids reprovaram e por que, senao a unica saida seria testar aluno
 * por aluno. Em todas as outras rotas `data` continua `null` no erro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { apiResponse } from '@/lib/auth';
import { requireAdminWithRecentMfa } from '@/lib/auth/admin-mfa.guard';
import { withApiHandler } from '@/lib/api-handler';
import { createAssignmentSchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdminWithRecentMfa(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const assignments = await exerciseService.listAssignments(id);
    return NextResponse.json(apiResponse(assignments));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});

export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdminWithRecentMfa(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = createAssignmentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  try {
    const assignments = await exerciseService.grant(id, parsed.data.studentIds, auth.id);
    return NextResponse.json(apiResponse(assignments), { status: 201 });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    const details = err.details ?? null;
    return NextResponse.json(
      apiResponse(details, err.message),
      { status: statusForAppError(err) },
    );
  }
});
