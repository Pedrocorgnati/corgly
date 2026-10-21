// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

import { regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

const stripeMock = vi.hoisted(() => ({
  pricesRetrieve: vi.fn(),
  sessionsCreate: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    prices: { retrieve: stripeMock.pricesRetrieve },
    checkout: { sessions: { create: stripeMock.sessionsCreate } },
  }),
}));

const APP_URL = 'https://app.example.com';
const TEST_PRICE_ID = 'price_regression_test_0001';
const LIVE_PRICE_ID = 'price_regression_live_0001';
const SLUG = regressionEbookInput.slug;
const COPY_UNAVAILABLE = regressionEbookInput.copy.errors.checkoutUnavailable;
const COPY_FAILED = regressionEbookInput.copy.errors.checkoutFailed;

const basePrice = {
  id: TEST_PRICE_ID,
  active: true,
  type: 'one_time',
  unit_amount: 1990,
  currency: 'usd',
  livemode: false,
};

// Import dinamico DEPOIS do resetModules do beforeEach: o catalogo e o servico
// carregam o registro mockado e a mesma instancia de errors que o servico usa.
async function loadCheckoutModule() {
  return import('@/lib/ebooks/checkout');
}

async function loadCheckoutErrorClass() {
  const errors = await import('@/lib/ebooks/errors');
  return errors.EbookCheckoutError;
}

/** Executa a chamada e devolve o erro capturado, validando a classe do modulo. */
async function captureCheckoutError(run: () => Promise<unknown>): Promise<unknown> {
  const EbookCheckoutError = await loadCheckoutErrorClass();
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(EbookCheckoutError);
    return err;
  }
  throw new Error('esperava EbookCheckoutError, mas a chamada resolveu sem erro');
}

beforeEach(() => {
  vi.resetModules();
  stripeMock.pricesRetrieve.mockReset();
  stripeMock.sessionsCreate.mockReset();
  vi.doMock('../../../../content/ebooks/index', () => ({ ebookRegistry: [regressionEbookInput] }));
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_fake');
  vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_TEST', TEST_PRICE_ID);
  vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_LIVE', LIVE_PRICE_ID);
  vi.stubEnv('EBOOK_STATEMENT_DESCRIPTOR_SUFFIX', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createEbookCheckoutSession: sucesso', () => {
  it('cria a sessao com os parametros fechados de D-A5/D-A6/D-A7', async () => {
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockResolvedValue({
      id: 'cs_test_0001',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0001',
    });

    const { createEbookCheckoutSession, EBOOK_STATEMENT_DESCRIPTOR_DEFAULT } =
      await loadCheckoutModule();
    const now = new Date('2026-10-19T12:00:00.000Z');
    const result = await createEbookCheckoutSession({ slug: SLUG, now });

    expect(EBOOK_STATEMENT_DESCRIPTOR_DEFAULT).toBe('CORGLY');
    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_0001' });
    expect(stripeMock.pricesRetrieve).toHaveBeenCalledWith(TEST_PRICE_ID, {}, { timeout: 10_000 });

    const expectedMetadata = {
      kind: 'ebook',
      ebook_slug: SLUG,
      withdrawal_waiver_version: '2026-10-19.1',
      withdrawal_waiver_at: now.toISOString(),
    };
    const expectedParams = {
      mode: 'payment',
      line_items: [{ price: TEST_PRICE_ID, quantity: 1 }],
      locale: 'en',
      submit_type: 'pay',
      adaptive_pricing: { enabled: false },
      success_url: `${APP_URL}/ebooks/${SLUG}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/ebooks/${SLUG}`,
      metadata: expectedMetadata,
      payment_intent_data: {
        metadata: expectedMetadata,
        statement_descriptor_suffix: 'CORGLY',
      },
    };
    expect(stripeMock.sessionsCreate).toHaveBeenCalledWith(expectedParams, { timeout: 10_000 });

    const params = stripeMock.sessionsCreate.mock.calls[0]?.[0];
    expect(params.metadata).toEqual(params.payment_intent_data.metadata);
    expect(params.success_url).toContain('{CHECKOUT_SESSION_ID}');
  });
});

describe('createEbookCheckoutSession: entrada desconhecida', () => {
  it('devolve 422 sem tocar na Stripe', async () => {
    const { createEbookCheckoutSession } = await loadCheckoutModule();
    const err = await captureCheckoutError(() =>
      createEbookCheckoutSession({ slug: 'slug-inexistente' }),
    );
    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_UNKNOWN_EBOOK',
      status: 422,
      message: 'Unknown ebook.',
    });
    expect(stripeMock.pricesRetrieve).not.toHaveBeenCalled();
    expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('createEbookCheckoutSession: modo Stripe e env do Price (D-A2)', () => {
  it('chave sk_test_ le a env de teste', async () => {
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockResolvedValue({
      id: 'cs_test_0002',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0002',
    });

    const { createEbookCheckoutSession } = await loadCheckoutModule();
    await createEbookCheckoutSession({ slug: SLUG });

    expect(stripeMock.pricesRetrieve).toHaveBeenCalledWith(TEST_PRICE_ID, {}, { timeout: 10_000 });
    expect(stripeMock.sessionsCreate.mock.calls[0]?.[0].line_items).toEqual([
      { price: TEST_PRICE_ID, quantity: 1 },
    ]);
  });

  it('chave sk_live_ le a env de live e usa o Price de live', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_synthetic_fake');
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice, id: LIVE_PRICE_ID, livemode: true });
    stripeMock.sessionsCreate.mockResolvedValue({
      id: 'cs_live_0001',
      url: 'https://checkout.stripe.com/c/pay/cs_live_0001',
    });

    const { createEbookCheckoutSession } = await loadCheckoutModule();
    await createEbookCheckoutSession({ slug: SLUG });

    expect(stripeMock.pricesRetrieve).toHaveBeenCalledWith(LIVE_PRICE_ID, {}, { timeout: 10_000 });
    expect(stripeMock.sessionsCreate.mock.calls[0]?.[0].line_items).toEqual([
      { price: LIVE_PRICE_ID, quantity: 1 },
    ]);
  });

  it('env do Price ausente devolve 503 com a mensagem do catalogo', async () => {
    vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_TEST', '');
    const { createEbookCheckoutSession } = await loadCheckoutModule();

    const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_UNAVAILABLE',
      status: 503,
      message: COPY_UNAVAILABLE,
    });
    expect(stripeMock.pricesRetrieve).not.toHaveBeenCalled();
    expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('createEbookCheckoutSession: guarda de Price (D-A3)', () => {
  it.each([
    { field: 'active', overrides: { active: false } },
    { field: 'type', overrides: { type: 'recurring' } },
    { field: 'unit_amount', overrides: { unit_amount: 1 } },
    { field: 'currency', overrides: { currency: 'eur' } },
    { field: 'livemode', overrides: { livemode: true } },
  ])('Price com $field divergente devolve 503 sem criar sessao', async ({ overrides }) => {
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice, ...overrides });
    const { createEbookCheckoutSession } = await loadCheckoutModule();

    const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_UNAVAILABLE',
      status: 503,
      message: COPY_UNAVAILABLE,
    });
    expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('createEbookCheckoutSession: descritor de extrato (D-A8)', () => {
  it('env vazia usa o default CORGLY', async () => {
    vi.stubEnv('EBOOK_STATEMENT_DESCRIPTOR_SUFFIX', '');
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockResolvedValue({
      id: 'cs_test_0003',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0003',
    });

    const { createEbookCheckoutSession } = await loadCheckoutModule();
    await createEbookCheckoutSession({ slug: SLUG });

    expect(stripeMock.sessionsCreate.mock.calls[0]?.[0].payment_intent_data).toEqual({
      metadata: stripeMock.sessionsCreate.mock.calls[0]?.[0].metadata,
      statement_descriptor_suffix: 'CORGLY',
    });
  });

  it('valor valido e usado exatamente como esta, sem trim', async () => {
    vi.stubEnv('EBOOK_STATEMENT_DESCRIPTOR_SUFFIX', ' ACME APP');
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockResolvedValue({
      id: 'cs_test_0004',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0004',
    });

    const { createEbookCheckoutSession } = await loadCheckoutModule();
    await createEbookCheckoutSession({ slug: SLUG });

    expect(stripeMock.sessionsCreate.mock.calls[0]?.[0].payment_intent_data.statement_descriptor_suffix).toBe(
      ' ACME APP',
    );
  });

  it.each(['a'.repeat(23), 'ACME*APP', '1234567890'])(
    'valor invalido (%s) devolve 503 sem chamar a Stripe',
    async (raw) => {
      vi.stubEnv('EBOOK_STATEMENT_DESCRIPTOR_SUFFIX', raw);
      const { createEbookCheckoutSession } = await loadCheckoutModule();

      const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

      expect(err).toMatchObject({
        code: 'EBOOK_CHECKOUT_UNAVAILABLE',
        status: 503,
        message: COPY_UNAVAILABLE,
      });
      expect(stripeMock.pricesRetrieve).not.toHaveBeenCalled();
      expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
    },
  );
});

describe('createEbookCheckoutSession: erros Stripe (D-A13)', () => {
  it('StripeConnectionError no retrieve vira 504 com a mensagem do catalogo', async () => {
    stripeMock.pricesRetrieve.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({ message: 'x' } as never),
    );
    const { createEbookCheckoutSession } = await loadCheckoutModule();

    const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_GATEWAY_TIMEOUT',
      status: 504,
      message: COPY_FAILED,
    });
    expect(stripeMock.sessionsCreate).not.toHaveBeenCalled();
  });

  it('StripeError generico no create vira 502 sem eco da mensagem do fornecedor', async () => {
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockRejectedValue(
      new Stripe.errors.StripeAPIError({
        message: 'segredo do fornecedor',
        type: 'api_error',
      } as never),
    );
    const { createEbookCheckoutSession } = await loadCheckoutModule();

    const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_GATEWAY_ERROR',
      status: 502,
      message: COPY_FAILED,
    });
    expect((err as Error).message).not.toContain('segredo do fornecedor');
  });

  it('sessao criada sem url vira 502', async () => {
    stripeMock.pricesRetrieve.mockResolvedValue({ ...basePrice });
    stripeMock.sessionsCreate.mockResolvedValue({ id: 'cs_sem_url', url: null });
    const { createEbookCheckoutSession } = await loadCheckoutModule();

    const err = await captureCheckoutError(() => createEbookCheckoutSession({ slug: SLUG }));

    expect(err).toMatchObject({
      code: 'EBOOK_CHECKOUT_GATEWAY_ERROR',
      status: 502,
      message: COPY_FAILED,
    });
  });
});

describe('resolveStripeMode', () => {
  it('sk_live_ -> live; qualquer outro valor -> test', async () => {
    const { resolveStripeMode } = await loadCheckoutModule();
    expect(resolveStripeMode('sk_live_synthetic_fake')).toBe('live');
    expect(resolveStripeMode('sk_test_synthetic_fake')).toBe('test');
    expect(resolveStripeMode('sk_outro_prefixo')).toBe('test');
    expect(resolveStripeMode('')).toBe('test');
  });
});

describe('resolveStatementDescriptorSuffix', () => {
  it('ausente ou vazio devolve o default', async () => {
    const { resolveStatementDescriptorSuffix, EBOOK_STATEMENT_DESCRIPTOR_DEFAULT } =
      await loadCheckoutModule();
    expect(resolveStatementDescriptorSuffix(undefined)).toBe(EBOOK_STATEMENT_DESCRIPTOR_DEFAULT);
    expect(resolveStatementDescriptorSuffix('')).toBe('CORGLY');
  });

  it('valor valido devolve o valor como esta', async () => {
    const { resolveStatementDescriptorSuffix } = await loadCheckoutModule();
    expect(resolveStatementDescriptorSuffix('ACME APP')).toBe('ACME APP');
    expect(resolveStatementDescriptorSuffix('a')).toBe('a');
    expect(resolveStatementDescriptorSuffix('a'.repeat(22))).toBe('a'.repeat(22));
  });

  it.each(['a'.repeat(23), 'ACME*APP', 'ACME<APP', '1234567890', '   '])(
    'valor invalido (%s) devolve null',
    async (raw) => {
      const { resolveStatementDescriptorSuffix } = await loadCheckoutModule();
      expect(resolveStatementDescriptorSuffix(raw)).toBeNull();
    },
  );
});
