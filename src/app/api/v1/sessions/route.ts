import { NextRequest, NextResponse } from 'next/server';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { BookSessionSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
import {
  bookingIdempotencyService,
  BookingConflictError,
} from '@/lib/bookings/booking-idempotency.service';

/** GET /api/v1/sessions */
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
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '20');
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;

    if (role === 'ADMIN') {
      const result = await sessionService.listAll({ status, page, limit, from, to });
      return NextResponse.json(apiResponse(result));
    }

    const result = await sessionService.listByStudent(userId, { status, page, limit, from, to });
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
