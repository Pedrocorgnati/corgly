import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { AppError } from '@/lib/errors';

/**
 * Acceptance T-028 / §12.4.1 (boundary Stripe):
 * - replay: o Stripe responde com a sessão original (header idempotent-replayed)
 *   e o serviço propaga `replayed: true` mantendo o mesmo sessionId.
 * - payload divergente com mesma Idempotency-Key: o Stripe lança
 *   StripeIdempotencyError e o serviço mapeia para AppError 409 (PAYMENT_061).
 */

const sessionsCreate = vi.fn();
const customersCreate = vi.fn();

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate } },
    customers: { create: customersCreate },
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        email: 'u@example.com',
        name: 'User',
        stripeCustomerId: 'cus_existing',
      }),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/pricing/config', () => ({
  resolvePrice: () => ({ priceId: null, amountCents: 1000 }),
  toStripeCurrency: (c: string) => c.toLowerCase(),
}));

vi.mock('@/lib/constants/stripe-prices', () => ({
  PACKAGE_CREDITS: { SINGLE: 1, BULK: 10, PROMO: 1 },
  PACKAGE_LABELS: { SINGLE: 'Single', BULK: 'Bulk', PROMO: 'Promo' },
}));

import { checkoutService } from '@/lib/billing/checkout.service';

const input = { packageType: 'SINGLE' as const, currency: 'USD' as const };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
});

describe('CheckoutService.createOneTimeCheckout - idempotência', () => {
  it('injeta a Idempotency-Key no segundo argumento de sessions.create', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://stripe/cs_1', lastResponse: { headers: {} } });
    await checkoutService.createOneTimeCheckout('user_1', false, input, 'client-key-12345678');

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const [, opts] = sessionsCreate.mock.calls[0];
    expect(opts.idempotencyKey).toBe('corgly_checkout:user_1:SINGLE:client-key-12345678');
  });

  it('replay: propaga replayed=true quando o Stripe responde com idempotent-replayed', async () => {
    sessionsCreate.mockResolvedValue({
      id: 'cs_orig',
      url: 'https://stripe/cs_orig',
      lastResponse: { headers: { 'idempotent-replayed': 'true' } },
    });
    const result = await checkoutService.createOneTimeCheckout('user_1', false, input);
    expect(result.replayed).toBe(true);
    expect(result.sessionId).toBe('cs_orig');
  });

  it('primeira criação: replayed=false', async () => {
    sessionsCreate.mockResolvedValue({
      id: 'cs_new',
      url: 'https://stripe/cs_new',
      lastResponse: { headers: {} },
    });
    const result = await checkoutService.createOneTimeCheckout('user_1', false, input);
    expect(result.replayed).toBe(false);
    expect(result.sessionId).toBe('cs_new');
  });

  it('payload divergente com mesma chave -> StripeIdempotencyError mapeado para AppError 409', async () => {
    sessionsCreate.mockRejectedValue(
      new Stripe.errors.StripeIdempotencyError({
        type: 'idempotency_error',
        message: 'Keys for idempotent requests can only be used with the same parameters.',
      } as never),
    );

    await expect(
      checkoutService.createOneTimeCheckout('user_1', false, input, 'client-key-12345678'),
    ).rejects.toMatchObject({ code: 'PAYMENT_061', status: 409 });
  });

  it('erros não-idempotentes do Stripe propagam sem conversão para 409', async () => {
    sessionsCreate.mockRejectedValue(new Error('boom'));
    await expect(
      checkoutService.createOneTimeCheckout('user_1', false, input),
    ).rejects.toThrow('boom');
    await expect(
      checkoutService.createOneTimeCheckout('user_1', false, input),
    ).rejects.not.toBeInstanceOf(AppError);
  });
});
