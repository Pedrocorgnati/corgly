// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockCreateSetupIntentForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));

vi.mock('@/lib/billing/payment-methods.service', () => ({
  paymentMethodsService: {
    createSetupIntentForUser: mockCreateSetupIntentForUser,
  },
}));

import { POST } from './route';

function request() {
  return new NextRequest('http://localhost/api/v1/billing/setup-intent', {
    method: 'POST',
  });
}

describe('POST /api/v1/billing/setup-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockCreateSetupIntentForUser.mockResolvedValue({
      setupIntentId: 'seti_123',
      clientSecret: 'seti_secret_123',
    });
  });

  it('cria SetupIntent para usuário autenticado', async () => {
    const res = await POST(request());

    expect(res.status).toBe(201);
    expect(mockCreateSetupIntentForUser).toHaveBeenCalledWith('user-1');

    const body = await res.json();
    expect(body.data).toEqual({
      setupIntentId: 'seti_123',
      clientSecret: 'seti_secret_123',
    });
    expect(body.message).toBe('SetupIntent criado para o customer autenticado.');
  });

  it('retorna CTA de suporte quando customer Stripe está ausente', async () => {
    mockCreateSetupIntentForUser.mockRejectedValue(
      new AppError(
        'PAYMENT_070',
        'Não encontramos um customer Stripe para sua conta. Fale com o suporte para revisar sua assinatura.',
        409,
      ),
    );

    const res = await POST(request());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('PAYMENT_070');
    expect(body.data.supportCta).toEqual({
      label: 'Falar com suporte',
      href: '/support',
    });
  });
});
