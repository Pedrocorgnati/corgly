/**
 * POST /api/v1/admin/exercises/[id]/publish
 *
 * Sem corpo. As seis pre-condicoes de publicacao vivem no service e chegam aqui
 * como `AppError` ja carimbado (409 para transicao impossivel, 422 para conteudo
 * incompleto).
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
    const exercise = await exerciseService.publish(id, auth.id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao publicar exercicio.'),
      { status: statusForAppError(err) },
    );
  }
}
