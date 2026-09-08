/**
 * GET  /api/v1/admin/exercises - biblioteca do admin (filtro + paginacao)
 * POST /api/v1/admin/exercises - cria exercicio em DRAFT
 *
 * A rota e casca: guard, parse, service, traducao de erro. Zero Prisma, zero
 * regra de dominio. Schema recusado = 400; regra de dominio recusada = o
 * status que o `AppError` carrega (422 na maioria).
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { createExerciseSchema, exerciseListQuerySchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = exerciseListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Filtros invalidos.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.listForAdmin(parsed.data);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao listar exercicios.'),
      { status: statusForAppError(err) },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = createExerciseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  try {
    const exercise = await exerciseService.create(parsed.data, auth.id);
    return NextResponse.json(apiResponse(exercise), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao criar exercicio.'),
      { status: statusForAppError(err) },
    );
  }
}
