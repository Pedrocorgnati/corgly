/**
 * GET   /api/v1/admin/exercises/[id] - detalhe COM gabarito
 * PATCH /api/v1/admin/exercises/[id] - edicao parcial com reconciliacao de itens
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { updateExerciseSchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const exercise = await exerciseService.getForAdmin(id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao carregar exercicio.'),
      { status: statusForAppError(err) },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = updateExerciseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  try {
    const exercise = await exerciseService.update(id, parsed.data, auth.id);
    return NextResponse.json(apiResponse(exercise));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao atualizar exercicio.'),
      { status: statusForAppError(err) },
    );
  }
}
