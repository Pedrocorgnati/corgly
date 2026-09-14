/**
 * POST /api/v1/exercises/[id]/attempts/[attemptId]/items/[itemId]/match-check
 *
 * Valida um unico candidato de MATCH_CLICK para feedback imediato. Esta rota
 * nao persiste resposta, nao altera contadores e nunca devolve o gabarito.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { matchPairCandidateSchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; attemptId: string; itemId: string }>;
  },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id, attemptId, itemId } = await params;

  const rl = await checkRateLimit(
    `exercise-answer:${auth.id}`,
    RATE_LIMITS.EXERCISE_ANSWER_SUBMIT,
  );

  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas respostas em sequencia. Aguarde um momento.'),
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = matchPairCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.checkMatchPair(
      {
        exerciseId: id,
        attemptId,
        itemId,
        leftId: parsed.data.leftId,
        rightId: parsed.data.rightId,
      },
      auth.id,
    );

    return NextResponse.json(apiResponse({ isCorrect: result.isCorrect }));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
