/**
 * DELETE /api/v1/admin/exercises/[id]/assignments/[assignmentId]
 *
 * Revoga o acesso. O verbo e DELETE, o efeito NAO e apagar: a linha vira
 * REVOKED e continua ancorando as tentativas que o aluno ja fez. Apagar de
 * verdade levaria o historico junto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdminWithRecentMfa } from '@/lib/auth/admin-mfa.guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) => {
  const auth = await requireAdminWithRecentMfa(request);
  if (auth instanceof NextResponse) return auth;

  const { id, assignmentId } = await params;

  try {
    const assignment = await exerciseService.revoke(id, assignmentId, auth.id);
    return NextResponse.json(apiResponse(assignment));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
