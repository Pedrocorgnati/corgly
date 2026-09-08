/**
 * GET /api/v1/exercises - exercicios liberados para o aluno logado
 *
 * Nunca lista o catalogo inteiro: a consulta parte das liberacoes ACTIVE do
 * proprio aluno. E o payload nao carrega `answerKey` - gabarito so aparece
 * depois de responder ou de finalizar a tentativa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { studentExerciseListQuerySchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = studentExerciseListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Filtros invalidos.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.listForStudent(auth.id, parsed.data);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao listar exercicios.'),
      { status: statusForAppError(err) },
    );
  }
}
