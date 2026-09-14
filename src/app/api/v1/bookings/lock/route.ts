import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { BookingRuleViolation } from '@/lib/constants/enums';
import { requireAuth } from '@/lib/auth-guard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  bookingIdempotencyService,
  BookingConflictError,
} from '@/lib/bookings/booking-idempotency.service';

const IdempotencyKeySchema = z.string().min(8).max(120);

const LockBookingSchema = z.object({
  availabilitySlotId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema.optional(),
});

/** POST /api/v1/bookings/lock — reserva atômica com lock TTL e idempotência. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;

  const rateLimit = await checkRateLimit(
    `sessions:${userId}`,
    RATE_LIMITS.SESSIONS_CREATE,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      apiResponse(
        null,
        'Muitas tentativas. Aguarde 1 minuto.',
        null,
        'RATE_001',
      ),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = LockBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const resolvedKey = request.headers.get('idempotency-key') ?? parsed.data.idempotencyKey ?? null;
    const parsedKey = IdempotencyKeySchema.nullable().safeParse(resolvedKey);
    if (!parsedKey.success) {
      return NextResponse.json(
        apiResponse(null, 'Idempotency-Key inválida.', parsedKey.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await bookingIdempotencyService.lockAndBook(
      userId,
      { availabilitySlotId: parsed.data.availabilitySlotId },
      parsedKey.data,
    );

    return NextResponse.json(
      apiResponse(result, null, result.idempotentReplay ? 'Reserva já processada.' : 'Aula reservada com sucesso.'),
      { status: result.idempotentReplay ? 200 : 201 },
    );
  } catch (err: unknown) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        apiResponse(
          { alternatives: err.alternatives },
          err.message,
          'Escolha um dos horários alternativos disponíveis.',
          err.code,
        ),
        { status: err.status },
      );
    }
    if (err instanceof AppError) {
      const publicCode =
        err.code === 'BOOKING_005'
          ? BookingRuleViolation.INSUFFICIENT_CREDITS
          : err.code;
      return NextResponse.json(
        apiResponse(null, err.message, null, publicCode),
        { status: err.status },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
