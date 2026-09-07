import { NextRequest, NextResponse } from 'next/server';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';

/**
 * GET /api/v1/admin/availability?date=YYYY-MM-DD[&until=YYYY-MM-DD]
 *
 * Visão de admin da janela: devolve TODOS os slots, inclusive bloqueados e
 * vendidos, com a sessão ocupante. A rota pública (`/api/v1/availability`)
 * filtra os dois casos por contrato, e é justamente o que o painel do professor
 * precisa enxergar.
 *
 * Além do guard próprio abaixo, o prefixo `/api/v1/admin` já é coberto por
 * `ADMIN_ONLY_PATHS` em `src/proxy.ts`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

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

  // Mesma janela default de sete dias da rota pública.
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

  // Mesmo teto de 84 dias derivado de `weeksAhead` max 12.
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
    const slots = await availabilityService.listForAdmin(date, untilEfetivo);
    return NextResponse.json(apiResponse(slots));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
