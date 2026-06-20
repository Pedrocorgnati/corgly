// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockCreateSessionForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));

vi.mock('@/lib/billing/customer-portal.service', () => ({
  customerPortalService: {
    createSessionForUser: mockCreateSessionForUser,
  },
}));

import { POST } from './route';

function request(body: unknown = {}) {
  return new NextRequest('http://localhost/api/v1/billing/portal/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/billing/portal/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockCreateSessionForUser.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session',
      sessionId: 'bps_123',
      returnUrl: 'https://app.test/billing/subscription',
    });
  });

  it('cria sessão Stripe Customer Portal para usuário autenticado', async () => {
    const res = await POST(request({ returnTo: '/billing/subscription?portal=returned' }));

    expect(res.status).toBe(200);
    expect(mockCreateSessionForUser).toHaveBeenCalledWith(
      'user-1',
      '/billing/subscription?portal=returned',
    );

    const body = await res.json();
    expect(body.data.url).toBe('https://billing.stripe.com/p/session');
    expect(body.message).toBe('Sessão do Customer Portal criada.');
  });

  it('retorna CTA de suporte quando customer Stripe está ausente', async () => {
    mockCreateSessionForUser.mockRejectedValue(
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
    expect(body.error).toContain('customer Stripe');
  });

  it('valida returnTo antes de chamar o serviço', async () => {
    const res = await POST(request({ returnTo: 'x'.repeat(301) }));

    expect(res.status).toBe(400);
    expect(mockCreateSessionForUser).not.toHaveBeenCalled();
  });
});
