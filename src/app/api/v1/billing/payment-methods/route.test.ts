// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockListForUser = vi.hoisted(() => vi.fn());
const mockSetDefaultForUser = vi.hoisted(() => vi.fn());

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
    listForUser: mockListForUser,
    setDefaultForUser: mockSetDefaultForUser,
  },
}));

import { GET, PATCH } from './route';

const paymentMethodsPayload = {
  items: [
    {
      id: 'pm_visa',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      funding: 'credit',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  defaultPaymentMethodId: 'pm_visa',
};

function getRequest() {
  return new NextRequest('http://localhost/api/v1/billing/payment-methods', {
    method: 'GET',
  });
}

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/billing/payment-methods', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/v1/billing/payment-methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockListForUser.mockResolvedValue(paymentMethodsPayload);
    mockSetDefaultForUser.mockResolvedValue(paymentMethodsPayload);
  });

  it('lista métodos sanitizados para usuário autenticado', async () => {
    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    expect(mockListForUser).toHaveBeenCalledWith('user-1');

    const body = await res.json();
    expect(body.data).toEqual(paymentMethodsPayload);
    expect(JSON.stringify(body.data)).not.toContain('client_secret');
    expect(JSON.stringify(body.data)).not.toContain('number');
  });

  it('define método padrão via PATCH', async () => {
    const res = await PATCH(patchRequest({ paymentMethodId: 'pm_visa' }));

    expect(res.status).toBe(200);
    expect(mockSetDefaultForUser).toHaveBeenCalledWith('user-1', 'pm_visa');

    const body = await res.json();
    expect(body.message).toBe('Método de pagamento padrão atualizado.');
  });

  it('valida body antes de trocar método padrão', async () => {
    const res = await PATCH(patchRequest({ paymentMethodId: '' }));

    expect(res.status).toBe(400);
    expect(mockSetDefaultForUser).not.toHaveBeenCalled();
  });

  it('retorna CTA de suporte quando customer Stripe está ausente', async () => {
    mockListForUser.mockRejectedValue(
      new AppError(
        'PAYMENT_070',
        'Não encontramos um customer Stripe para sua conta. Fale com o suporte para revisar sua assinatura.',
        409,
      ),
    );

    const res = await GET(getRequest());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('PAYMENT_070');
    expect(body.data.supportCta).toEqual({
      label: 'Falar com suporte',
      href: '/support',
    });
  });
});
