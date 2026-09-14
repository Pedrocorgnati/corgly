/**
 * GET /api/v1/exercises/[id] - envelope jogavel do aluno
 *
 * Sem `answerKey` no payload. Exercicio inexistente e exercicio nao liberado
 * respondem coisas diferentes de proposito: 404 quando nao existe ou nao esta
 * publicado, 403 quando existe e o aluno nao tem liberacao.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const exercise = await exerciseService.getPlayableForStudent(id, auth.id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
