// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  lockAndBook: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: {
    SESSIONS_CREATE: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock('@/lib/bookings/booking-idempotency.service', () => {
  class BookingConflictError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly alternatives: Array<{ id: string; startAt: string; endAt: string }> = [],
    ) {
      super(message);
      this.name = 'BookingConflictError';
    }
  }

  return {
    bookingIdempotencyService: { lockAndBook: mocks.lockAndBook },
    BookingConflictError,
  };
});

import { BookingRuleViolation } from '@/lib/constants/enums';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-guard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  bookingIdempotencyService,
  BookingConflictError,
} from '@/lib/bookings/booking-idempotency.service';
import { POST } from '@/app/api/v1/bookings/lock/route';

const SLOT_ID = '11111111-1111-4111-8111-111111111111';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/v1/bookings/lock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'booking-key-12345678',
      'x-user-id': 'student-1',
    },
    body: JSON.stringify({ availabilitySlotId: SLOT_ID }),
  });
}

describe('POST /api/v1/bookings/lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      tokenVersion: 1,
    });
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 19,
      resetAt: Date.now() + 60_000,
    });
    mocks.lockAndBook.mockResolvedValue({
      session: { id: 'session-1' },
      idempotentReplay: false,
      lock: { key: 'student-1:booking-key-12345678', expiresAt: new Date().toISOString() },
      alternatives: [],
    });
  });

  it('revalida a sessao antes do rate limit e da reserva', async () => {
    const unauthorized = NextResponse.json(
      { data: null, error: 'Sessão invalidada. Faça login novamente.' },
      { status: 401 },
    );
    mocks.requireAuth.mockResolvedValueOnce(unauthorized);

    const response = await POST(request());

    expect(response).toBe(unauthorized);
    expect(vi.mocked(requireAuth)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
    expect(vi.mocked(bookingIdempotencyService.lockAndBook)).not.toHaveBeenCalled();
  });

  it('aplica o limite especifico de criacao por usuario antes de reservar', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(vi.mocked(checkRateLimit)).toHaveBeenCalledWith(
      'sessions:student-1',
      RATE_LIMITS.SESSIONS_CREATE,
    );
    expect(vi.mocked(bookingIdempotencyService.lockAndBook)).toHaveBeenCalledTimes(1);
  });

  it('responde 429 e nao reserva quando o limite especifico foi excedido', async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      data: null,
      error: 'Muitas tentativas. Aguarde 1 minuto.',
      code: 'RATE_001',
    });
    expect(vi.mocked(bookingIdempotencyService.lockAndBook)).not.toHaveBeenCalled();
  });

  it('traduz BOOKING_005 para o discriminante publico de saldo insuficiente', async () => {
    mocks.lockAndBook.mockRejectedValueOnce(
      new AppError('BOOKING_005', 'Créditos insuficientes.', 402),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toMatchObject({
      data: null,
      error: 'Créditos insuficientes.',
      code: BookingRuleViolation.INSUFFICIENT_CREDITS,
    });
  });

  it('preserva codigo e alternativas de conflitos de reserva', async () => {
    const alternatives = [
      {
        id: 'slot-2',
        startAt: '2026-06-20T15:00:00.000Z',
        endAt: '2026-06-20T15:50:00.000Z',
      },
    ];
    mocks.lockAndBook.mockRejectedValueOnce(
      new BookingConflictError(
        'SESSION_057',
        'Horário indisponível por ocupação externa.',
        409,
        alternatives,
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      data: { alternatives },
      error: 'Horário indisponível por ocupação externa.',
      code: 'SESSION_057',
    });
  });

  it('rejeita Idempotency-Key do header fora dos limites do contrato', async () => {
    const invalidRequest = new NextRequest('http://localhost/api/v1/bookings/lock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'curta',
        'x-user-id': 'student-1',
      },
      body: JSON.stringify({ availabilitySlotId: SLOT_ID }),
    });

    const response = await POST(invalidRequest);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      data: null,
      error: 'Idempotency-Key inválida.',
    });
    expect(vi.mocked(bookingIdempotencyService.lockAndBook)).not.toHaveBeenCalled();
  });
});
