import { NextRequest, NextResponse } from 'next/server';
import { GenerateSlotsSchema } from '@/schemas/availability.schema';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { requireAdmin } from '@/lib/auth-guard';

/** GET /api/v1/availability?date=YYYY-MM-DD[&until=YYYY-MM-DD] */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date');
  const until = searchParams.get('until');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetro date inválido. Use formato YYYY-MM-DD.'),
      { status: 400 },
    );
  }

  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetro until inválido. Use formato YYYY-MM-DD.'),
      { status: 400 },
    );
  }

  // Sem `until`, a janela default continua sendo de sete dias: o contrato HTTP
  // de quem envia apenas `date` fica igual ao de antes.
  const untilEfetivo =
    until ??
    new Date(new Date(`${date}T00:00:00.000Z`).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  // Strings YYYY-MM-DD ordenam lexicograficamente igual a datas.
  if (untilEfetivo <= date) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetro until deve ser posterior a date.'),
      { status: 400 },
    );
  }

  // Teto derivado de `weeksAhead` max 12 em src/schemas/availability.schema.ts:
  // alem de 84 dias nao existe slot gerado, e a rota responde sem autenticacao.
  const janelaEmDias =
    (new Date(`${untilEfetivo}T00:00:00.000Z`).getTime() -
      new Date(`${date}T00:00:00.000Z`).getTime()) /
    (24 * 60 * 60 * 1000);
  if (janelaEmDias > 84) {
    return NextResponse.json(
      apiResponse(null, 'Janela solicitada excede o horizonte máximo de 84 dias.'),
      { status: 400 },
    );
  }

  try {
    const slots = await availabilityService.getAvailable(date, untilEfetivo);
    return NextResponse.json(apiResponse(slots));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/availability — admin: generate slots */
export async function POST(request: NextRequest) {
  // RESOLVED: Auth bypass
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = GenerateSlotsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await availabilityService.generateSlots(parsed.data);
    return NextResponse.json(apiResponse(result, null, 'Slots gerados com sucesso.'), { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
