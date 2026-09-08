/**
 * POST /api/v1/admin/exercises/[id]/archive
 *
 * Sem corpo. Arquivar duas vezes e 409 (`EXERCISE_007`), nao no-op silencioso:
 * o admin precisa saber que o estado ja era o pedido.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const exercise = await exerciseService.archive(id, auth.id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao arquivar exercicio.'),
      { status: statusForAppError(err) },
    );
  }
}
