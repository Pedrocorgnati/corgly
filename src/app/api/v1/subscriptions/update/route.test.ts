// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));
const mockUpdateSubscription = vi.hoisted(() => vi.fn());
const mockResolveRequestIdempotencyKey = vi.hoisted(() => vi.fn());
const mockRunIdempotency = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/stripe.service', () => ({
  stripeService: { updateSubscription: mockUpdateSubscription },
}));
vi.mock('@/lib/billing/idempotency.service', () => ({
  resolveRequestIdempotencyKey: mockResolveRequestIdempotencyKey,
  financialIdempotencyService: { run: mockRunIdempotency },
}));

import { POST } from './route';
import { AppError } from '@/lib/errors';

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/v1/subscriptions/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/subscriptions/update idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockResolveRequestIdempotencyKey.mockReturnValue('key-12345678');
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      stripeSubscriptionId: 'stripe_sub_1',
    });
    mockPrisma.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      weeklyFrequency: 3,
    });
  });

  it('executa update financeiro uma vez usando Idempotency-Key', async () => {
    mockRunIdempotency.mockImplementation(
      async (
        _scope: string,
        _ownerId: string,
        _key: string,
        _payload: unknown,
        operation: (idempotencyKey: string) => Promise<unknown>,
      ) => ({ result: await operation('scoped-key'), idempotentReplay: false }),
    );

    const res = await POST(request({ weeklyFrequency: 3 }, { 'Idempotency-Key': 'key-12345678' }));

    expect(res.status).toBe(200);
    expect(mockUpdateSubscription).toHaveBeenCalledTimes(1);
    expect(mockUpdateSubscription).toHaveBeenCalledWith('stripe_sub_1', 3, 'scoped-key');
    expect(mockRunIdempotency).toHaveBeenCalledWith(
      'subscription_update',
      'user-1',
      'key-12345678',
      expect.objectContaining({ weeklyFrequency: 3, subscriptionId: 'sub-1' }),
      expect.any(Function),
    );

    const body = await res.json();
    expect(body.data.idempotentReplay).toBe(false);
    expect(body.data.subscription.weeklyFrequency).toBe(3);
  });

  it('repassa prorationDate do preview para a confirmacao no Stripe', async () => {
    mockRunIdempotency.mockImplementation(
      async (
        _scope: string,
        _ownerId: string,
        _key: string,
        _payload: unknown,
        operation: (idempotencyKey: string) => Promise<unknown>,
      ) => ({ result: await operation('scoped-key'), idempotentReplay: false }),
    );

    const res = await POST(
      request(
        { weeklyFrequency: 4, prorationDate: 1781784000 },
        { 'Idempotency-Key': 'key-12345678' },
      ),
    );

    expect(res.status).toBe(200);
    expect(mockUpdateSubscription).toHaveBeenCalledWith(
      'stripe_sub_1',
      4,
      'scoped-key',
      { prorationDate: 1781784000 },
    );
    expect(mockRunIdempotency).toHaveBeenCalledWith(
      'subscription_update',
      'user-1',
      'key-12345678',
      expect.objectContaining({ weeklyFrequency: 4, prorationDate: 1781784000 }),
      expect.any(Function),
    );
  });

  it('replay retorna resultado salvo sem chamar stripe novamente', async () => {
    mockRunIdempotency.mockResolvedValue({
      result: { id: 'sub-1', weeklyFrequency: 4 },
      idempotentReplay: true,
    });

    const res = await POST(request({ weeklyFrequency: 4 }, { 'X-Idempotency-Key': 'key-12345678' }));

    expect(res.status).toBe(200);
    expect(mockUpdateSubscription).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.data).toEqual({
      subscription: { id: 'sub-1', weeklyFrequency: 4 },
      idempotentReplay: true,
    });
  });

  it('payload divergente para mesma chave retorna 409 sem chamar stripe', async () => {
    mockRunIdempotency.mockRejectedValue(
      new AppError('PAYMENT_064', 'Idempotency-Key reutilizada com payload divergente.', 409),
    );

    const res = await POST(request({ weeklyFrequency: 5 }, { 'Idempotency-Key': 'key-12345678' }));

    expect(res.status).toBe(409);
    expect(mockUpdateSubscription).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe('Idempotency-Key reutilizada com payload divergente.');
  });

  it('concorrência simples com mesma chave retorna 409 sem chamar stripe', async () => {
    mockRunIdempotency.mockRejectedValue(
      new AppError(
        'PAYMENT_065',
        'Operação financeira já está em processamento para esta Idempotency-Key.',
        409,
      ),
    );

    const res = await POST(request({ weeklyFrequency: 3 }, { 'X-Idempotency-Key': 'key-12345678' }));

    expect(res.status).toBe(409);
    expect(mockUpdateSubscription).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe('Operação financeira já está em processamento para esta Idempotency-Key.');
  });
});
