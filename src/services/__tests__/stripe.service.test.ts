// @vitest-environment node
import { StripeService } from '../stripe.service';
import { AppError } from '@/lib/errors';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaMocks = vi.hoisted(() => {
  return {
    paymentFindUnique: vi.fn(),
    paymentCreate: vi.fn(),
    creditBatchCreate: vi.fn(),
    userUpdate: vi.fn(),
    subscriptionFindFirst: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    paymentUpdateMany: vi.fn(),
    stripeWebhookEventFindUnique: vi.fn(),
    stripeWebhookEventCreate: vi.fn(),
    stripeWebhookEventUpdate: vi.fn(),
    stripeWebhookEventFindMany: vi.fn(),
    stripeWebhookEventCount: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: {
      findUnique: prismaMocks.paymentFindUnique,
      create: prismaMocks.paymentCreate,
      updateMany: prismaMocks.paymentUpdateMany,
    },
    stripeWebhookEvent: {
      findUnique: prismaMocks.stripeWebhookEventFindUnique,
      create: prismaMocks.stripeWebhookEventCreate,
      update: prismaMocks.stripeWebhookEventUpdate,
      findMany: prismaMocks.stripeWebhookEventFindMany,
      count: prismaMocks.stripeWebhookEventCount,
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
  invoicePaymentsList: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: stripeMocks.webhooksConstructEvent,
    },
    invoicePayments: {
      list: stripeMocks.invoicePaymentsList,
    },
  }),
}));

describe('StripeService.handleWebhook', () => {
  let service: StripeService;

  beforeEach(() => {
    service = new StripeService();
    vi.clearAllMocks();
    prismaMocks.stripeWebhookEventFindUnique.mockResolvedValue(null);
    prismaMocks.stripeWebhookEventCreate.mockImplementation(async ({ data }) =>
      webhookEventRecord(data),
    );
    prismaMocks.stripeWebhookEventUpdate.mockImplementation(async ({ data }) =>
      webhookEventRecord({ ...data, status: data.status ?? 'PROCESSED' }),
    );
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

  it('caso 3b: event.id já processado → replay idempotente sem handlers financeiros', async () => {
    const mockEvent = {
      id: 'evt_processed',
      type: 'checkout.session.completed',
      data: { object: { metadata: {} } },
    };

    stripeMocks.webhooksConstructEvent.mockReturnValue(mockEvent);
    prismaMocks.stripeWebhookEventFindUnique.mockResolvedValue(
      webhookEventRecord({ eventId: 'evt_processed', type: 'checkout.session.completed', status: 'PROCESSED' }),
    );

    await service.handleWebhook(Buffer.from('{}'), 'valid-sig');

    expect(prismaMocks.paymentFindUnique).not.toHaveBeenCalled();
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(prismaMocks.stripeWebhookEventCreate).not.toHaveBeenCalled();
    expect(prismaMocks.stripeWebhookEventUpdate).not.toHaveBeenCalled();
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
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IGNORED' }) }),
    );
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

/**
 * DEFEITO 1 - credito dobrado a cada renovacao.
 *
 * `dispatchWebhookEvent` roteia `invoice.payment_succeeded` E `invoice.paid`
 * para o mesmo handler, e o Stripe emite os dois para a MESMA fatura com ids de
 * evento diferentes. Com a guarda antiga (`where: { stripeEventId }`) os dois
 * passavam e o assinante ganhava dois lotes de credito por mes. A guarda agora e
 * por FATURA, e a constraint `Payment.stripePaymentIntentId @unique` decide a
 * corrida entre dois webhooks simultaneos.
 */
describe('StripeService - idempotencia da fatura (DEFEITO 1)', () => {
  let service: StripeService;
  /** Banco de mentira com a unique de `Payment.stripePaymentIntentId`. */
  let paymentsByMoneyKey: Map<string, { id: string }>;
  let creditBatchCreates: unknown[];
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  /** Fatura de renovacao com um PaymentIntent no proprio payload. */
  function renewalInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'in_renovacao_1',
      amount_paid: 17000,
      currency: 'usd',
      parent: { subscription_details: { subscription: 'sub_local_1' } },
      payments: {
        data: [
          {
            created: 1_700_000_000,
            status: 'paid',
            payment: { type: 'payment_intent', payment_intent: 'pi_renovacao_1' },
          },
        ],
      },
      ...overrides,
    };
  }

  function invoiceEvent(id: string, type: string, invoice: Record<string, unknown>) {
    return { id, type, data: { object: invoice } };
  }

  /** Roda o par completo de eventos que o Stripe emite para uma fatura. */
  async function deliverBothInvoiceEvents(invoice: Record<string, unknown>) {
    stripeMocks.webhooksConstructEvent.mockReturnValueOnce(
      invoiceEvent('evt_succeeded', 'invoice.payment_succeeded', invoice),
    );
    await service.handleWebhook(Buffer.from('{}'), 'sig');

    stripeMocks.webhooksConstructEvent.mockReturnValueOnce(
      invoiceEvent('evt_paid', 'invoice.paid', invoice),
    );
    await service.handleWebhook(Buffer.from('{}'), 'sig');
  }

  beforeEach(() => {
    service = new StripeService();
    vi.clearAllMocks();
    paymentsByMoneyKey = new Map();
    creditBatchCreates = [];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prismaMocks.stripeWebhookEventFindUnique.mockResolvedValue(null);
    prismaMocks.stripeWebhookEventCreate.mockImplementation(async ({ data }) =>
      webhookEventRecord(data),
    );
    prismaMocks.stripeWebhookEventUpdate.mockImplementation(async ({ data }) =>
      webhookEventRecord({ ...data, status: data.status ?? 'PROCESSED' }),
    );

    prismaMocks.subscriptionFindFirst.mockResolvedValue({
      id: 'sub-local-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_local_1',
      monthlyLessons: 10,
      weeklyFrequency: 2,
    });

    // Caminho rapido: le a mesma tabela em que o `create` grava.
    prismaMocks.paymentFindUnique.mockImplementation(
      async ({ where }: { where: { stripePaymentIntentId?: string } }) =>
        where.stripePaymentIntentId
          ? (paymentsByMoneyKey.get(where.stripePaymentIntentId) ?? null)
          : null,
    );

    // `payment.create` respeita a unique: chave repetida vira P2002, como no banco.
    prismaMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const created: string[] = [];
      const batchesBefore = creditBatchCreates.length;
      const fakeTx = {
        creditBatch: {
          create: vi.fn(async ({ data }: { data: unknown }) => {
            creditBatchCreates.push(data);
            return { id: `batch-${creditBatchCreates.length}` };
          }),
        },
        payment: {
          create: vi.fn(async ({ data }: { data: { stripePaymentIntentId: string } }) => {
            if (paymentsByMoneyKey.has(data.stripePaymentIntentId)) {
              throw Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
                meta: { target: ['stripePaymentIntentId'] },
              });
            }
            paymentsByMoneyKey.set(data.stripePaymentIntentId, { id: 'payment-1' });
            created.push(data.stripePaymentIntentId);
            return {};
          }),
        },
        user: { update: vi.fn() },
      };

      try {
        return await fn(fakeTx);
      } catch (error) {
        // Rollback real: nem o lote de credito nem o Payment sobrevivem a
        // transacao que falhou, e e disso que depende a idempotencia via P2002.
        creditBatchCreates.length = batchesBefore;
        for (const key of created) paymentsByMoneyKey.delete(key);
        throw error;
      }
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('payment_succeeded seguido de paid credita a fatura UMA vez', async () => {
    await deliverBothInvoiceEvents(renewalInvoice());

    expect(creditBatchCreates).toHaveLength(1);
    expect(creditBatchCreates[0]).toMatchObject({
      userId: 'user-1',
      type: 'MONTHLY',
      totalCredits: 10,
    });
    // A chave gravada e a do dinheiro, nao a do evento.
    expect([...paymentsByMoneyKey.keys()]).toEqual(['pi_renovacao_1']);
    // O segundo evento consultou a fatura, nao o proprio id.
    expect(prismaMocks.paymentFindUnique).toHaveBeenLastCalledWith({
      where: { stripePaymentIntentId: 'pi_renovacao_1' },
    });
    // Os dois eventos terminam PROCESSED: o duplicado nao vira 500.
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('dois webhooks simultaneos: a unique do banco decide, sem credito duplicado', async () => {
    // Ambos leem ANTES de qualquer gravacao: o caminho rapido nao ve duplicata.
    prismaMocks.paymentFindUnique.mockResolvedValue(null);

    await deliverBothInvoiceEvents(renewalInvoice());

    expect(creditBatchCreates).toHaveLength(1);
    expect(paymentsByMoneyKey.size).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Webhook] fatura ja creditada por evento concorrente, ignorada',
      expect.objectContaining({ invoiceId: 'in_renovacao_1', moneyKey: 'pi_renovacao_1' }),
    );
    // P2002 e no-op idempotente, nao falha: o evento fecha PROCESSED.
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('payload sem `payments`: a chave vem de invoicePayments.list e ainda dedupe', async () => {
    // Lista expansivel ausente no evento — o caso que fazia os dois eventos
    // resolverem chaves diferentes e creditarem duas vezes.
    const invoice = renewalInvoice({ payments: undefined });
    stripeMocks.invoicePaymentsList.mockResolvedValue({
      data: [
        {
          created: 1_700_000_050,
          status: 'paid',
          payment: { type: 'payment_intent', payment_intent: 'pi_mais_novo' },
        },
        {
          created: 1_700_000_000,
          status: 'paid',
          payment: { type: 'payment_intent', payment_intent: 'pi_mais_antigo' },
        },
      ],
    });

    await deliverBothInvoiceEvents(invoice);

    expect(stripeMocks.invoicePaymentsList).toHaveBeenCalledWith({
      invoice: 'in_renovacao_1',
      status: 'paid',
      limit: 100,
    });
    expect(creditBatchCreates).toHaveLength(1);
    // Desempate deterministico: vence o pagamento mais antigo nos DOIS eventos.
    expect([...paymentsByMoneyKey.keys()]).toEqual(['pi_mais_antigo']);
  });

  it('fatura quitada por saldo de credito (sem PaymentIntent) credita uma vez so', async () => {
    stripeMocks.invoicePaymentsList.mockResolvedValue({ data: [] });

    await deliverBothInvoiceEvents(
      renewalInvoice({ id: 'in_saldo_1', payments: undefined, amount_paid: 0 }),
    );

    expect(creditBatchCreates).toHaveLength(1);
    expect([...paymentsByMoneyKey.keys()]).toEqual(['pi_in_saldo_1']);
  });

  it('falha ao consultar o Stripe: PAYMENT_094, evento FAILED e ZERO credito', async () => {
    stripeMocks.invoicePaymentsList.mockRejectedValue(new Error('connect ETIMEDOUT'));
    stripeMocks.webhooksConstructEvent.mockReturnValue(
      invoiceEvent(
        'evt_succeeded',
        'invoice.payment_succeeded',
        renewalInvoice({ payments: undefined }),
      ),
    );

    let thrown: unknown = null;
    try {
      await service.handleWebhook(Buffer.from('{}'), 'sig');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: 'PAYMENT_094', status: 500 });
    // Sem chave confiavel NAO se inventa uma: nada e creditado e o Stripe reentrega.
    expect(creditBatchCreates).toHaveLength(0);
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});

/**
 * ZERO SILENCIO - dinheiro que chega sem destino local.
 *
 * Duas situacoes em que `onInvoicePaid` nao tem a quem creditar: a fatura chega
 * sem id de assinatura (sem ele nem da para consultar o banco, porque
 * `findFirst` com filtro `undefined` devolveria uma assinatura qualquer) e a
 * fatura aponta para uma assinatura que nao existe localmente. Com valor pago,
 * as duas PRECISAM lancar — o evento fecha FAILED, a linha aparece na lista de
 * webhooks do admin e o Stripe reentrega. Com valor pago zero (trial, proracao
 * credora) nao ha dinheiro escondido: registra e segue, sem falsear falha.
 *
 * Sem estes testes, trocar qualquer um dos dois `throw` de volta pelo `return`
 * silencioso original passaria verde.
 */
describe('StripeService - fatura sem destino local (Zero Silencio)', () => {
  let service: StripeService;
  let creditBatchCreates: unknown[];
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  /** Fatura com PaymentIntent no proprio payload: a chave do dinheiro resolve sem consultar o Stripe. */
  function orphanInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'in_orfa_1',
      amount_paid: 17000,
      currency: 'usd',
      parent: { subscription_details: { subscription: 'sub_remota_1' } },
      payments: {
        data: [
          {
            created: 1_700_000_000,
            status: 'paid',
            payment: { type: 'payment_intent', payment_intent: 'pi_orfa_1' },
          },
        ],
      },
      ...overrides,
    };
  }

  /** Entrega o evento e devolve o erro lancado, ou `null` quando nada estourou. */
  async function deliverInvoicePaid(invoice: Record<string, unknown>): Promise<unknown> {
    stripeMocks.webhooksConstructEvent.mockReturnValue({
      id: 'evt_orfa',
      type: 'invoice.paid',
      data: { object: invoice },
    });
    try {
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      return null;
    } catch (error) {
      return error;
    }
  }

  beforeEach(() => {
    service = new StripeService();
    vi.clearAllMocks();
    creditBatchCreates = [];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prismaMocks.stripeWebhookEventFindUnique.mockResolvedValue(null);
    prismaMocks.stripeWebhookEventCreate.mockImplementation(async ({ data }) =>
      webhookEventRecord(data),
    );
    prismaMocks.stripeWebhookEventUpdate.mockImplementation(async ({ data }) =>
      webhookEventRecord({ ...data, status: data.status ?? 'PROCESSED' }),
    );
    // Fatura ainda nao creditada: o caminho rapido nao encurta nenhum destes casos.
    prismaMocks.paymentFindUnique.mockResolvedValue(null);
    prismaMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        creditBatch: {
          create: vi.fn(async ({ data }: { data: unknown }) => {
            creditBatchCreates.push(data);
            return { id: 'batch-1' };
          }),
        },
        payment: { create: vi.fn() },
        user: { update: vi.fn() },
      }),
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('fatura paga sem assinatura de origem: PAYMENT_092, evento FAILED e zero credito', async () => {
    const thrown = await deliverInvoicePaid(orphanInvoice({ parent: null }));

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: 'PAYMENT_092', status: 500 });
    // Sem id de assinatura o banco NAO pode ser consultado: um `findFirst` com
    // filtro `undefined` creditaria o aluno errado.
    expect(prismaMocks.subscriptionFindFirst).not.toHaveBeenCalled();
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(creditBatchCreates).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Webhook] fatura paga sem assinatura de origem - credito nao concedido',
      expect.objectContaining({ invoiceId: 'in_orfa_1', amountPaid: 17000 }),
    );
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('fatura de valor zero sem assinatura de origem: registra e segue, sem falhar', async () => {
    const thrown = await deliverInvoicePaid(orphanInvoice({ parent: null, amount_paid: 0 }));

    // Nao ha dinheiro a reconciliar: transformar isto em 500 faria o Stripe
    // reentregar para sempre um evento que nunca teve credito a conceder.
    expect(thrown).toBeNull();
    expect(creditBatchCreates).toHaveLength(0);
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Webhook] fatura sem assinatura de origem e sem valor pago, ignorada: in_orfa_1',
    );
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('fatura paga sem Subscription local: PAYMENT_093, evento FAILED e zero credito', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValue(null);

    const thrown = await deliverInvoicePaid(orphanInvoice());

    expect(prismaMocks.subscriptionFindFirst).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_remota_1' },
    });
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: 'PAYMENT_093', status: 500 });
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(creditBatchCreates).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Webhook] fatura paga sem Subscription local - credito pendente',
      expect.objectContaining({
        stripeSubscriptionId: 'sub_remota_1',
        invoiceId: 'in_orfa_1',
        amountPaid: 17000,
      }),
    );
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('fatura de valor zero sem Subscription local: registra e segue, sem falhar', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValue(null);

    const thrown = await deliverInvoicePaid(orphanInvoice({ amount_paid: 0 }));

    expect(thrown).toBeNull();
    expect(creditBatchCreates).toHaveLength(0);
    expect(prismaMocks.transaction).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Webhook] fatura de valor zero sem Subscription local, ignorada: sub_remota_1',
    );
    expect(prismaMocks.stripeWebhookEventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });
});

function webhookEventRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-18T20:30:00.000Z');
  return {
    id: 'swe-1',
    eventId: overrides.eventId ?? 'evt_test_001',
    type: overrides.type ?? 'checkout.session.completed',
    status: overrides.status ?? 'RECEIVED',
    payload: overrides.payload ?? null,
    rawPayload: overrides.rawPayload ?? '{}',
    errorMessage: overrides.errorMessage ?? null,
    processedAt: overrides.processedAt ?? null,
    lastReplayAt: overrides.lastReplayAt ?? null,
    replayCount: overrides.replayCount ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}
