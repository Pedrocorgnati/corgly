/**
 * DELETE /api/v1/admin/exercises/[id]/assignments/[assignmentId]
 *
 * Revoga o acesso. O verbo e DELETE, o efeito NAO e apagar: a linha vira
 * REVOKED e continua ancorando as tentativas que o aluno ja fez. Apagar de
 * verdade levaria o historico junto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id, assignmentId } = await params;

  try {
    const assignment = await exerciseService.revoke(id, assignmentId, auth.id);
    return NextResponse.json(apiResponse(assignment));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao revogar liberacao.'),
      { status: statusForAppError(err) },
    );
  }
}
