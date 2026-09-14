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
import { requireAdminWithRecentMfa } from '@/lib/auth/admin-mfa.guard';
import { withApiHandler } from '@/lib/api-handler';
import { AppError } from '@/lib/errors';
import { createExerciseSchema, exerciseListQuerySchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdminWithRecentMfa(request);
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
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdminWithRecentMfa(request);
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
    if (!(err instanceof AppError)) throw err;
    return NextResponse.json(
      apiResponse(null, err.message),
      { status: statusForAppError(err) },
    );
  }
});
