// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

import { regressionEbookInput } from '../fixtures/ebooks/regression-ebook';

// Rota de ponta a ponta: servico real + catalogo de fixture; so o client Stripe
// e o rate limit sao mockados. Nenhuma chave Stripe real e usada.
const mocks = vi.hoisted(() => ({
  pricesRetrieve: vi.fn(),
  sessionsCreate: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    prices: { retrieve: mocks.pricesRetrieve },
    checkout: { sessions: { create: mocks.sessionsCreate } },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: {
    EBOOK_CHECKOUT: { maxRequests: 10, windowMs: 60_000 },
  },
}));

const APP_URL = 'https://app.example.com';
const ROUTE_URL = `${APP_URL}/api/v1/ebooks/checkout`;
const TEST_PRICE_ID = 'price_regression_test_0001';
const SLUG = regressionEbookInput.slug;
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_0001';
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

// Import dinamico DEPOIS do resetModules: env, catalogo e servico releem os
// stubs do beforeEach.
async function loadRoute() {
  return import('@/app/api/v1/ebooks/checkout/route');
}

interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

function buildRequest({ method = 'POST', body, headers = {} }: RequestOptions = {}): NextRequest {
  return new NextRequest(ROUTE_URL, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: APP_URL,
      'user-agent': 'vitest-agent',
      'x-forwarded-for': '203.0.113.7',
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
  });
}

function validBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ slug: SLUG, withdrawalWaiver: true, ...overrides });
}

async function post(options: RequestOptions = {}) {
  const { POST } = await loadRoute();
  return POST(buildRequest({ body: validBody(), ...options }));
}

function mockStripeSuccess(): void {
  mocks.pricesRetrieve.mockResolvedValue({ ...basePrice });
  mocks.sessionsCreate.mockResolvedValue({ id: 'cs_test_0001', url: CHECKOUT_URL });
}

beforeEach(() => {
  vi.resetModules();
  mocks.pricesRetrieve.mockReset();
  mocks.sessionsCreate.mockReset();
  mocks.checkRateLimit.mockReset();
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
  vi.doMock('../../../content/ebooks/index', () => ({ ebookRegistry: [regressionEbookInput] }));
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_fake');
  vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_TEST', TEST_PRICE_ID);
  vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_LIVE', 'price_regression_live_0001');
  vi.stubEnv('EBOOK_STATEMENT_DESCRIPTOR_SUFFIX', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/ebooks/checkout: sucesso', () => {
  it('devolve 201 com checkoutUrl, no-store e a sessao criada com os parametros do servico', async () => {
    mockStripeSuccess();

    const res = await post();

    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      data: { checkoutUrl: CHECKOUT_URL },
      error: null,
      message: null,
    });
    expect(mocks.pricesRetrieve).toHaveBeenCalledWith(TEST_PRICE_ID, {}, { timeout: 10_000 });
    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1);
    const [params, options] = mocks.sessionsCreate.mock.calls[0]!;
    expect(options).toEqual({ timeout: 10_000 });
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [{ price: TEST_PRICE_ID, quantity: 1 }],
      locale: 'en',
      submit_type: 'pay',
      adaptive_pricing: { enabled: false },
      success_url: `${APP_URL}/ebooks/${SLUG}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/ebooks/${SLUG}`,
      metadata: { kind: 'ebook', ebook_slug: SLUG, withdrawal_waiver_version: '2026-10-19.1' },
      payment_intent_data: {
        metadata: { kind: 'ebook', ebook_slug: SLUG },
        statement_descriptor_suffix: 'CORGLY',
      },
    });
  });

  it('aceita content-type com charset', async () => {
    mockStripeSuccess();

    const res = await post({ headers: { 'content-type': 'application/json; charset=utf-8' } });

    expect(res.status).toBe(201);
  });

  it('aceita request sem header Origin', async () => {
    mockStripeSuccess();
    const { POST } = await loadRoute();
    const req = buildRequest({ body: validBody() });
    req.headers.delete('origin');

    const res = await POST(req);

    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/ebooks/checkout: borda HTTP', () => {
  it('415 quando o content-type nao e JSON', async () => {
    const res = await post({ headers: { 'content-type': 'text/plain' } });

    expect(res.status).toBe(415);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      data: null,
      code: 'EBOOK_CHECKOUT_UNSUPPORTED_MEDIA_TYPE',
    });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['origem de outro site', 'https://evil.example.com'],
    ['origem com outra porta', 'https://app.example.com:8443'],
    ["origem 'null'", 'null'],
  ])('403 para %s', async (_label, origin) => {
    const res = await post({ headers: { origin } });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_ORIGIN_NOT_ALLOWED' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('chama o rate limit com a chave IP+UA e o teto EBOOK_CHECKOUT', async () => {
    mockStripeSuccess();

    await post();

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^ebook-checkout:203\.0\.113\.7:[0-9a-f]{12}$/),
      { maxRequests: 10, windowMs: 60_000 },
    );
  });

  it('429 com Retry-After quando o rate limit estoura', async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await post();

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_RATE_LIMITED' });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('413 quando o Content-Length declarado passa de 1024', async () => {
    const res = await post({ headers: { 'content-length': '2048' } });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_PAYLOAD_TOO_LARGE' });
  });

  it('413 quando o corpo real passa de 1024 bytes', async () => {
    const res = await post({ body: validBody({ padding: 'x'.repeat(2000) }) });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_PAYLOAD_TOO_LARGE' });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON invalido', '{"slug":'],
    ['chave extra', validBody({ extra: 1 })],
    ['withdrawalWaiver ausente', JSON.stringify({ slug: SLUG })],
    ['withdrawalWaiver false', validBody({ withdrawalWaiver: false })],
    ['withdrawalWaiver string', validBody({ withdrawalWaiver: 'true' })],
    ['slug fora do padrao', validBody({ slug: 'Slug_Invalido' })],
    ['slug acima de 64 caracteres', validBody({ slug: 'a'.repeat(65) })],
    ['corpo que nao e objeto', JSON.stringify([SLUG])],
  ])('400 para %s', async (_label, body) => {
    const res = await post({ body });

    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      data: null,
      error: 'Invalid input.',
      code: 'EBOOK_CHECKOUT_INVALID_INPUT',
    });
    expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('405 com Allow: POST para %s', async (method) => {
    const route = await loadRoute();

    const res = await route[method]();

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_METHOD_NOT_ALLOWED' });
  });
});

describe('POST /api/v1/ebooks/checkout: erros do servico', () => {
  it('422 para slug valido fora do catalogo', async () => {
    const res = await post({ body: validBody({ slug: 'ebook-inexistente' }) });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_UNKNOWN_EBOOK' });
    expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
  });

  it('503 com a copia do catalogo quando a env do Price esta ausente', async () => {
    vi.stubEnv('STRIPE_PRICE_EBOOK_REGRESSION_TEST', '');

    const res = await post();

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: COPY_UNAVAILABLE,
      code: 'EBOOK_CHECKOUT_UNAVAILABLE',
    });
    expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
  });

  it('503 quando o Price diverge do catalogo', async () => {
    mocks.pricesRetrieve.mockResolvedValue({ ...basePrice, unit_amount: 999 });

    const res = await post();

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_UNAVAILABLE' });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('502 sem refletir a mensagem do gateway', async () => {
    mocks.pricesRetrieve.mockResolvedValue({ ...basePrice });
    mocks.sessionsCreate.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'segredo-do-gateway-nao-pode-vazar',
      } as never),
    );

    const res = await post();
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain('segredo-do-gateway-nao-pode-vazar');
    expect(JSON.parse(text)).toMatchObject({
      error: COPY_FAILED,
      code: 'EBOOK_CHECKOUT_GATEWAY_ERROR',
    });
  });

  it('502 quando a sessao volta sem url', async () => {
    mocks.pricesRetrieve.mockResolvedValue({ ...basePrice });
    mocks.sessionsCreate.mockResolvedValue({ id: 'cs_test_0001', url: null });

    const res = await post();

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'EBOOK_CHECKOUT_GATEWAY_ERROR' });
  });

  it('504 quando a conexao com o gateway falha', async () => {
    mocks.pricesRetrieve.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        type: 'api_connection_error',
        message: 'timeout',
      } as never),
    );

    const res = await post();

    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({
      error: COPY_FAILED,
      code: 'EBOOK_CHECKOUT_GATEWAY_TIMEOUT',
    });
  });

  it('500 generico do withApiHandler para falha que nao e do checkout', async () => {
    mocks.pricesRetrieve.mockRejectedValue(new Error('falha-interna-inesperada'));

    const res = await post();
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain('falha-interna-inesperada');
  });
});
