// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
  },
}));
const mockGetStripe = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/stripe', () => ({ getStripe: mockGetStripe }));

import { AppError } from '@/lib/errors';
import {
  calculateSubscriptionMonthlyAmountCents,
  previewSubscriptionChange,
} from '@/lib/billing/subscription-preview.service';

function activeSubscription(weeklyFrequency = 2) {
  return {
    id: 'sub-db-1',
    userId: 'user-1',
    stripeSubscriptionId: 'sub_stripe_1',
    status: 'ACTIVE',
    weeklyFrequency,
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    cancelledAt: null,
  };
}

describe('subscription preview service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('calcula o valor mensal com a mesma regra usada pela assinatura', () => {
    expect(calculateSubscriptionMonthlyAmountCents(1)).toBe(6928);
    expect(calculateSubscriptionMonthlyAmountCents(4)).toBe(27712);
  });

  it('retorna preview local para plano atual usando a moeda do Stripe', async () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    mockPrisma.subscription.findFirst.mockResolvedValue(activeSubscription(2));
    const retrieve = vi.fn().mockResolvedValue({
      id: 'sub_stripe_1',
      items: {
        data: [
          {
            id: 'si_1',
            price: {
              currency: 'brl',
              product: 'prod_1',
              tax_behavior: 'exclusive',
            },
          },
        ],
      },
    });
    mockGetStripe.mockReturnValue({
      subscriptions: { retrieve },
      invoices: { createPreview: vi.fn() },
    });

    const preview = await previewSubscriptionChange('user-1', { weeklyFrequency: 2 });

    expect(retrieve).toHaveBeenCalledWith('sub_stripe_1');
    expect(preview).toMatchObject({
      subscriptionId: 'sub-db-1',
      currentWeeklyFrequency: 2,
      requestedWeeklyFrequency: 2,
      changeType: 'current_plan',
      currency: 'brl',
      currentMonthlyAmountCents: 69280,
      prorationAmountCents: 0,
      estimatedTaxCents: 0,
      amountDueNowCents: 0,
      previewPayload: {
        weeklyFrequency: 2,
        prorationDate: 1781784000,
      },
    });
  });

  it('usa Stripe createPreview para upgrade com proration e imposto estimado', async () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    mockPrisma.subscription.findFirst.mockResolvedValue(activeSubscription(2));
    const createPreview = vi.fn().mockResolvedValue({
      id: 'upcoming_in_1',
      currency: 'usd',
      amount_due: 1400,
      subtotal: 1200,
      total: 1400,
      total_tax_amounts: [{ amount: 200 }],
      lines: {
        data: [
          {
            amount: 1200,
            parent: { subscription_item_details: { proration: true } },
          },
        ],
      },
    });
    const retrieve = vi.fn().mockResolvedValue({
      id: 'sub_stripe_1',
      items: {
        data: [
          {
            id: 'si_1',
            price: {
              currency: 'usd',
              product: 'prod_1',
              tax_behavior: 'exclusive',
            },
          },
        ],
      },
    });
    mockGetStripe.mockReturnValue({
      subscriptions: { retrieve },
      invoices: { createPreview },
    });

    const preview = await previewSubscriptionChange('user-1', { weeklyFrequency: 4 });

    expect(retrieve).toHaveBeenCalledWith('sub_stripe_1');
    expect(createPreview).toHaveBeenCalledWith({
      subscription: 'sub_stripe_1',
      subscription_details: {
        items: [
          {
            id: 'si_1',
            price_data: {
              currency: 'usd',
              product: 'prod_1',
              recurring: { interval: 'month' },
              unit_amount: 27712,
              tax_behavior: 'exclusive',
            },
          },
        ],
        proration_behavior: 'create_prorations',
        proration_date: 1781784000,
      },
    });
    expect(preview).toMatchObject({
      currentWeeklyFrequency: 2,
      requestedWeeklyFrequency: 4,
      changeType: 'upgrade',
      prorationAmountCents: 1200,
      estimatedTaxCents: 200,
      amountDueNowCents: 1400,
      stripePreviewId: 'upcoming_in_1',
      previewPayload: {
        weeklyFrequency: 4,
        prorationDate: 1781784000,
      },
    });
  });

  it('falha quando nao existe assinatura ativa', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    await expect(
      previewSubscriptionChange('user-1', { weeklyFrequency: 3 }),
    ).rejects.toMatchObject(new AppError('PAYMENT_080', 'Nenhuma assinatura ativa encontrada.', 404));
  });
});
