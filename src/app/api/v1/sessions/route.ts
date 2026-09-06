import { NextRequest, NextResponse } from 'next/server';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { BookSessionSchema } from '@/schemas/session.schema';
import {
  SESSION_SORTS,
  parseSessionSort,
  sessionService,
} from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
import {
  bookingIdempotencyService,
  BookingConflictError,
} from '@/lib/bookings/booking-idempotency.service';

const MAX_PAGE_SIZE = 100;

/**
 * Inteiro positivo vindo da querystring, com piso, teto e fallback.
 * `Number('abc')` e NaN e NaN vira `take: NaN` no Prisma — 500 sem explicacao.
 */
function positiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

/** `true` quando o parametro veio preenchido e nao e uma data ISO parseavel. */
function isBrokenDate(raw: string | null): boolean {
  return raw !== null && Number.isNaN(Date.parse(raw));
}

/**
 * GET /api/v1/sessions
 *
 * Querystring: `status`, `page`, `limit`, `from`, `to`, `sort`.
 *  - `from`/`to` (ISO 8601) filtram por `startAt` no servico.
 *  - `sort` aceita `startAt:asc` | `startAt:desc` (default `startAt:desc`).
 *    Consumidor de `startAt:asc`: `getDashboardNextSession`
 *    (src/actions/dashboard.ts), que pede a proxima aula com
 *    `status=SCHEDULED&from=<agora>&sort=startAt:asc&limit=1`.
 *
 * Parametro invalido nao e engolido: `from`/`to`/`sort` fora do contrato
 * respondem 400 com a razao. (`status` desconhecido segue sendo ignorado —
 * comportamento historico consumido pelas telas de historico/admin.)
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;
  const { searchParams } = request.nextUrl;
  const rawStatus = searchParams.get('status');
  const status =
    rawStatus && Object.values(PrismaSessionStatus).includes(rawStatus as PrismaSessionStatus)
      ? (rawStatus as PrismaSessionStatus)
      : undefined;

  try {
    const page = positiveInt(searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
    const limit = positiveInt(searchParams.get('limit'), 20, MAX_PAGE_SIZE);
    const rawFrom = searchParams.get('from');
    const rawTo = searchParams.get('to');
    const rawSort = searchParams.get('sort');

    if (isBrokenDate(rawFrom) || isBrokenDate(rawTo)) {
      return NextResponse.json(
        apiResponse(null, 'Período inválido.', 'Use datas ISO 8601 em `from` e `to`.'),
        { status: 400 },
      );
    }

    const sort = parseSessionSort(rawSort);
    if (rawSort !== null && sort === undefined) {
      return NextResponse.json(
        apiResponse(null, 'Ordenação inválida.', `Valores aceitos: ${SESSION_SORTS.join(', ')}.`),
        { status: 400 },
      );
    }

    const from = rawFrom ?? undefined;
    const to = rawTo ?? undefined;

    if (role === 'ADMIN') {
      const result = await sessionService.listAll({ status, page, limit, from, to, sort });
      return NextResponse.json(apiResponse(result));
    }

    const result = await sessionService.listByStudent(userId, {
      status,
      page,
      limit,
      from,
      to,
      sort,
    });
    return NextResponse.json(apiResponse(result));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/sessions — book a session */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const rl = await checkRateLimit(`sessions:${userId}`, RATE_LIMITS.SESSIONS_CREATE);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 1 minuto.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = BookSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await bookingIdempotencyService.lockAndBook(
      userId,
      parsed.data,
      request.headers.get('idempotency-key'),
    );
    return NextResponse.json(
      apiResponse(result.session, null, result.idempotentReplay ? 'Reserva já processada.' : 'Aula agendada com sucesso.'),
      { status: result.idempotentReplay ? 200 : 201 },
    );
  } catch (err: unknown) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        apiResponse(
          { alternatives: err.alternatives },
          err.message,
          'Escolha um dos horários alternativos disponíveis.',
        ),
        { status: err.status },
      );
    }
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_CREDITS')
        return NextResponse.json(apiResponse(null, 'Créditos insuficientes.'), { status: 400 });
      if (err.message === 'SLOT_UNAVAILABLE')
        return NextResponse.json(apiResponse(null, 'Horário não disponível. Selecione outro.'), { status: 409 });
      if (err.message === 'MAX_FUTURE_SESSIONS')
        return NextResponse.json(apiResponse(null, 'Limite de aulas futuras atingido.'), { status: 400 });
      if (err.message === 'PAST_SLOT')
        return NextResponse.json(apiResponse(null, 'Horário no passado.'), { status: 400 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
