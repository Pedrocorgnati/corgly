// @vitest-environment node
import { StripeService } from '../stripe.service';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaMocks = vi.hoisted(() => {
  return {
    paymentFindUnique: vi.fn(),
    paymentCreate: vi.fn(),
    creditBatchCreate: vi.fn(),
    userUpdate: vi.fn(),
    subscriptionFindFirst: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: {
      findUnique: prismaMocks.paymentFindUnique,
      create: prismaMocks.paymentCreate,
    },
    creditBatch: {
      create: prismaMocks.creditBatchCreate,
    },
    user: {
      update: prismaMocks.userUpdate,
    },
    subscription: {
      findFirst: prismaMocks.subscriptionFindFirst,
      updateMany: prismaMocks.subscriptionUpdateMany,
    },
    $transaction: prismaMocks.transaction,
  },
}));

// ─── Mock Stripe singleton ─────────────────────────────────────────────────
const stripeMocks = vi.hoisted(() => ({
  webhooksConstructEvent: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: stripeMocks.webhooksConstructEvent,
    },
  }),
}));

describe('StripeService.handleWebhook', () => {
  let service: StripeService;

  beforeEach(() => {
    service = new StripeService();
    vi.clearAllMocks();
  });

  // Caso 1: assinatura inválida → lança erro (capturado pela route como 400 PAYMENT_001)
  it('caso 1: Stripe-Signature inválida → constructEvent lança erro', () => {
    stripeMocks.webhooksConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    expect(() =>
      service.constructEvent(Buffer.from('{}'), 'invalid-sig'),
    ).toThrow('No signatures found');
  });

  // Caso 2: checkout.session.completed → CreditBatch + Payment criados atomicamente
  it('caso 2: checkout.session.completed válido → CreditBatch + Payment criados em transação', async () => {
    const mockEvent = {
      id: 'evt_test_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_001',
          metadata: { userId: 'user-1', packageType: 'PACK_5', creditQty: '5' },
          payment_intent: 'pi_test_001',
          amount_total: 11000,
          currency: 'usd',
        },
      },
    };

    stripeMocks.webhooksConstructEvent.mockReturnValue(mockEvent);
    prismaMocks.paymentFindUnique.mockResolvedValue(null); // sem duplicata
    prismaMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        creditBatch: { create: vi.fn().mockResolvedValue({ id: 'batch-1' }) },
        payment: { create: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn() },
      };
      return fn(fakeTx);
    });

    await service.handleWebhook(Buffer.from('{}'), 'valid-sig');

    expect(prismaMocks.paymentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeEventId: 'evt_test_001' } }),
    );
    expect(prismaMocks.transaction).toHaveBeenCalled();
  });

  // Caso 3: mesmo stripeEventId reenviado → 200 silencioso, sem duplicatas
  it('caso 3: stripeEventId duplicado → idempotência, transação NÃO executada', async () => {
    const mockEvent = {
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'user-1', packageType: 'SINGLE', creditQty: '1' },
          payment_intent: 'pi_001',
          amount_total: 2500,
          currency: 'usd',
        },
      },
    };

    stripeMocks.webhooksConstructEvent.mockReturnValue(mockEvent);
    // Simula registro duplicado existente
    prismaMocks.paymentFindUnique.mockResolvedValue({ id: 'existing-payment' });

    await service.handleWebhook(Buffer.from('{}'), 'valid-sig');

    // Transação NÃO deve ter sido chamada
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
  });

  // Caso 4: evento não reconhecido → 200 silencioso (sem erro)
  it('caso 4: evento não tratado → não lança erro (200 silencioso)', async () => {
    const mockEvent = {
      id: 'evt_unknown',
      type: 'payment_intent.created', // não tratado
      data: { object: {} },
    };

    stripeMocks.webhooksConstructEvent.mockReturnValue(mockEvent);

    await expect(service.handleWebhook(Buffer.from('{}'), 'valid-sig')).resolves.toBeUndefined();
  });

  // Caso adicional: isFirstPurchase=true (PROMO) → user.isFirstPurchase = false
  it('PROMO package → isFirstPurchase setado para false dentro da transação', async () => {
    const mockEvent = {
      id: 'evt_promo',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'user-1', packageType: 'PROMO', creditQty: '1' },
          payment_intent: 'pi_promo',
          amount_total: 1250,
          currency: 'usd',
        },
      },
    };

    stripeMocks.webhooksConstructEvent.mockReturnValue(mockEvent);
    prismaMocks.paymentFindUnique.mockResolvedValue(null);

    const mockUserUpdate = vi.fn().mockResolvedValue({});
    prismaMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        creditBatch: { create: vi.fn().mockResolvedValue({ id: 'batch-promo' }) },
        payment: { create: vi.fn().mockResolvedValue({}) },
        user: { update: mockUserUpdate },
      };
      return fn(fakeTx);
    });

    await service.handleWebhook(Buffer.from('{}'), 'valid-sig');

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isFirstPurchase: false } }),
    );
  });
});
