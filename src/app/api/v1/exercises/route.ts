/**
 * GET /api/v1/exercises - exercicios liberados para o aluno logado
 *
 * Nunca lista o catalogo inteiro: a consulta parte das liberacoes ACTIVE do
 * proprio aluno. E o payload nao carrega `answerKey` - gabarito so aparece
 * depois de responder ou de finalizar a tentativa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { studentExerciseListQuerySchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = studentExerciseListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Filtros invalidos.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.listForStudent(auth.id, parsed.data);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
