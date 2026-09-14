/**
 * POST /api/v1/exercises/[id]/attempts - comeca ou retoma a tentativa
 *
 * Sem corpo. Nao existe 409 aqui: chamar de novo com uma tentativa aberta
 * devolve a MESMA tentativa (`resumed: true`). O aluno que fechou a aba no meio
 * precisa voltar para onde estava, e nao ser barrado.
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
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const result = await exerciseService.startOrResumeAttempt(id, auth.id);
    return NextResponse.json(apiResponse(result), { status: result.resumed ? 200 : 201 });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
