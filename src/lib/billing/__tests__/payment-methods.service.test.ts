import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const {
  customersRetrieve,
  customersUpdate,
  paymentMethodsAttach,
  paymentMethodsList,
  paymentMethodsRetrieve,
  setupIntentsCreate,
  userFindUnique,
} = vi.hoisted(() => ({
  customersRetrieve: vi.fn(),
  customersUpdate: vi.fn(),
  paymentMethodsAttach: vi.fn(),
  paymentMethodsList: vi.fn(),
  paymentMethodsRetrieve: vi.fn(),
  setupIntentsCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: {
      retrieve: customersRetrieve,
      update: customersUpdate,
    },
    paymentMethods: {
      attach: paymentMethodsAttach,
      list: paymentMethodsList,
      retrieve: paymentMethodsRetrieve,
    },
    setupIntents: {
      create: setupIntentsCreate,
    },
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
    },
  },
}));

import { paymentMethodsService } from '../payment-methods.service';

describe('PaymentMethodsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_123' });
    setupIntentsCreate.mockResolvedValue({
      id: 'seti_123',
      client_secret: 'seti_secret_123',
    });
    paymentMethodsList.mockResolvedValue({
      data: [
        {
          id: 'pm_visa',
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2030,
            funding: 'credit',
          },
          created: 1_767_225_600,
        },
      ],
    });
    customersRetrieve.mockResolvedValue({
      id: 'cus_123',
      invoice_settings: {
        default_payment_method: 'pm_visa',
      },
    });
    paymentMethodsRetrieve.mockResolvedValue({
      id: 'pm_visa',
      customer: 'cus_123',
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2030,
      },
    });
  });

  it('cria SetupIntent para customer autenticado', async () => {
    const result = await paymentMethodsService.createSetupIntentForUser('user-1');

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { stripeCustomerId: true },
    });
    expect(setupIntentsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      usage: 'off_session',
      payment_method_types: ['card'],
    });
    expect(result).toEqual({
      setupIntentId: 'seti_123',
      clientSecret: 'seti_secret_123',
    });
  });

  it('lista métodos sem dados sensíveis completos', async () => {
    const result = await paymentMethodsService.listForUser('user-1');

    expect(paymentMethodsList).toHaveBeenCalledWith({
      customer: 'cus_123',
      type: 'card',
    });
    expect(result.items).toEqual([
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
    ]);
    expect(JSON.stringify(result.items)).not.toContain('client_secret');
    expect(JSON.stringify(result.items)).not.toContain('number');
  });

  it('define método padrão do próprio customer', async () => {
    const result = await paymentMethodsService.setDefaultForUser('user-1', 'pm_visa');

    expect(paymentMethodsRetrieve).toHaveBeenCalledWith('pm_visa');
    expect(paymentMethodsAttach).not.toHaveBeenCalled();
    expect(customersUpdate).toHaveBeenCalledWith('cus_123', {
      invoice_settings: {
        default_payment_method: 'pm_visa',
      },
    });
    expect(result.defaultPaymentMethodId).toBe('pm_visa');
  });

  it('anexa método sem customer antes de definir padrão', async () => {
    paymentMethodsRetrieve.mockResolvedValue({
      id: 'pm_new',
      customer: null,
      type: 'card',
      card: {
        brand: 'mastercard',
        last4: '4444',
        exp_month: 10,
        exp_year: 2031,
      },
    });

    await paymentMethodsService.setDefaultForUser('user-1', 'pm_new');

    expect(paymentMethodsAttach).toHaveBeenCalledWith('pm_new', {
      customer: 'cus_123',
    });
  });

  it('rejeita método de outro customer', async () => {
    paymentMethodsRetrieve.mockResolvedValue({
      id: 'pm_other',
      customer: 'cus_other',
      type: 'card',
    });

    await expect(
      paymentMethodsService.setDefaultForUser('user-1', 'pm_other'),
    ).rejects.toMatchObject({
      code: 'PAYMENT_072',
      status: 403,
    } satisfies Partial<AppError>);

    expect(customersUpdate).not.toHaveBeenCalled();
  });

  it('retorna erro rastreável quando customer Stripe não existe', async () => {
    userFindUnique.mockResolvedValue({ stripeCustomerId: null });

    await expect(paymentMethodsService.listForUser('user-1')).rejects.toMatchObject({
      code: 'PAYMENT_070',
      status: 409,
    } satisfies Partial<AppError>);
  });
});
