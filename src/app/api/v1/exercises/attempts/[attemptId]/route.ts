/**
 * GET /api/v1/exercises/attempts/[attemptId] - busca resumo da tentativa
 * PATCH /api/v1/exercises/attempts/[attemptId] - fecha ou abandona a tentativa
 *
 * Retorna o estado atual da tentativa com score e itens revisaveis.
 * Usado pela pagina de resumo para mostrar o resultado ao aluno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const closeAttemptSchema = z.object({ action: z.enum(['close', 'abandon']) });

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { attemptId } = await params;

  // O exerciseId vem da query string porque a URL nao tem o segmento [id]
  const { searchParams } = new URL(request.url);
  const exerciseId = searchParams.get('exerciseId');

  if (!exerciseId) {
    return NextResponse.json(
      apiResponse(null, 'exerciseId e obrigatorio.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.getAttemptSummary(exerciseId, attemptId, auth.id);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});

export const PATCH = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) => {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = closeAttemptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  const { attemptId } = await params;
  try {
    const result = await exerciseService.closeAttempt(
      attemptId,
      auth.id,
      parsed.data.action === 'abandon',
    );
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
