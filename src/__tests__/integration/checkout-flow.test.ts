import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock external dependencies
vi.mock('@/services/stripe.service', () => ({
  stripeService: {
    createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test', sessionId: 'cs_test' }),
    createSubscriptionCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sub-test', sessionId: 'cs_sub_test' }),
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getMe: vi.fn().mockResolvedValue({ id: 'user-1', isFirstPurchase: false }),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9 }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        role: 'STUDENT',
        tokenVersion: 1,
      }),
    },
  },
}));

function createRequest(body: object, headers: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost:3000/api/v1/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user-1',
      'x-user-role': 'STUDENT',
      'x-token-version': '1',
      ...headers,
    },
  });
  return req;
}

describe('POST /api/v1/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna checkoutUrl para compra avulsa (SINGLE)', async () => {
    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = createRequest({ packageType: 'SINGLE', isSubscription: false });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe('https://checkout.stripe.com/test');
  });

  it('retorna checkoutUrl para assinatura', async () => {
    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = createRequest({ isSubscription: true, weeklyFrequency: 2 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe('https://checkout.stripe.com/sub-test');
  });

  it('retorna 401 sem auth headers', async () => {
    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = new NextRequest('http://localhost:3000/api/v1/checkout', {
      method: 'POST',
      body: JSON.stringify({ packageType: 'SINGLE', isSubscription: false }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('retorna 400 para packageType inválido', async () => {
    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = createRequest({ packageType: 'INVALID', isSubscription: false });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // ST003 — PAYMENT_050: anti-fraude de desconto e assinatura duplicada
  it('deve bloquear assinatura duplicada ativa com PAYMENT_050 — ST003', async () => {
    const { AppError } = await import('@/lib/errors');
    const { stripeService } = await import('@/services/stripe.service');
    vi.mocked(stripeService.createSubscriptionCheckout).mockRejectedValueOnce(
      new AppError('PAYMENT_050', 'Usuário já possui assinatura ativa.', 409),
    );

    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = createRequest({ isSubscription: true, weeklyFrequency: 2 });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Usuário já possui assinatura ativa.');
  });

  it('não aplica desconto de primeira compra para usuário com isFirstPurchase=false (anti-fraude PAYMENT_050) — ST003', async () => {
    const { authService } = await import('@/services/auth.service');
    const { stripeService } = await import('@/services/stripe.service');

    vi.mocked(authService.getMe).mockResolvedValueOnce({
      id: 'user-1',
      isFirstPurchase: false,
    } as never);

    const { POST } = await import('@/app/api/v1/checkout/route');
    const req = createRequest({ packageType: 'SINGLE', isSubscription: false });
    const res = await POST(req);

    expect(res.status).toBe(200);
    // Verifica que isFirstPurchase=false foi passado ao stripeService — sem desconto
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      false,
      expect.objectContaining({ packageType: 'SINGLE' }),
    );
  });
});
