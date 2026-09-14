/**
 * POST /api/v1/admin/exercises/[id]/archive
 *
 * Sem corpo. Arquivar duas vezes e 409 (`EXERCISE_007`), nao no-op silencioso:
 * o admin precisa saber que o estado ja era o pedido.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdminWithRecentMfa } from '@/lib/auth/admin-mfa.guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdminWithRecentMfa(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const exercise = await exerciseService.archive(id, auth.id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
