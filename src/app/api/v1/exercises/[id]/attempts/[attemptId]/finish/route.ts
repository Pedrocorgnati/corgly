/**
 * POST /api/v1/exercises/[id]/attempts/[attemptId]/finish - encerra a tentativa
 *
 * Sem corpo. Devolve a revisao completa COM gabarito, item a item. Finalizar
 * com itens em branco e permitido: o aluno pode parar no meio e ainda ver o que
 * acertou. Finalizar duas vezes e 409.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id, attemptId } = await params;

  try {
    const result = await exerciseService.finishAttempt(id, attemptId, auth.id);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
