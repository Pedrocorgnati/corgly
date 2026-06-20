import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import {
  bookingIdempotencyService,
  BookingConflictError,
} from '@/lib/bookings/booking-idempotency.service';

const LockBookingSchema = z.object({
  availabilitySlotId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

/** POST /api/v1/bookings/lock — reserva atômica com lock TTL e idempotência. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;

  try {
    const body = await request.json();
    const parsed = LockBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const headerKey = request.headers.get('idempotency-key');
    const result = await bookingIdempotencyService.lockAndBook(
      userId,
      { availabilitySlotId: parsed.data.availabilitySlotId },
      headerKey ?? parsed.data.idempotencyKey ?? null,
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
        ),
        { status: err.status },
      );
    }
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
