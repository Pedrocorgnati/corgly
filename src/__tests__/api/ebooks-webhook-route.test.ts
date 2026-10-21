// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

// Rota de ponta a ponta com o nucleo real e a verificacao de assinatura real do
// SDK (local, sem rede). Mockados: `after` (fila em memoria), rate limit,
// client Stripe (so `paymentIntents.retrieve`), ledger Prisma em memoria e o
// port de fulfillment (o real so chega no item 006). Segredo e chave sao
// placeholders, nunca valores reais.

const TEST_SECRET = 'whsec_test_placeholder';
const ROUTE_URL = 'https://app.example.com/api/v1/webhooks/stripe/ebooks';

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Array<() => Promise<void>>,
  checkRateLimit: vi.fn(),
  retrieve: vi.fn(),
  fulfill: vi.fn(),
  rows: new Map<string, { eventId: string; status: string; claimedAt: Date | null }>(),
  ledgerCreate: vi.fn(),
  orderFindUnique: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (task: () => Promise<void>) => {
      mocks.afterTasks.push(task);
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: {
    WEBHOOK: { maxRequests: 100, windowMs: 60_000 },
  },
}));

vi.mock('@/lib/stripe', async () => {
  const { default: StripeSdk } = await import('stripe');
  const sdk = new StripeSdk('sk_test_placeholder');
  return {
    getStripe: () => ({
      webhooks: sdk.webhooks,
      paymentIntents: { retrieve: mocks.retrieve },
    }),
  };
});

vi.mock('@/lib/ebooks/webhook-ports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ebooks/webhook-ports')>();
  return {
    ...actual,
    getEbookWebhookPorts: () => ({
      fulfillCheckoutSession: mocks.fulfill,
      notifyAsyncPaymentFailed: vi.fn(async () => {}),
      notifyRefund: vi.fn(async () => {}),
      notifyDispute: vi.fn(async () => {}),
    }),
  };
});

// No vitest nao ha loader de imagem do Next: o import estatico de webp vira
// string de URL, entao o mock traz um StaticImageData para o catalogo real.
vi.mock('../../../content/ebooks/brazilian-portuguese-for-english-speakers/sales/cover.webp', () => ({
  default: { src: '/_next/static/media/cover.bp-en.webp', width: 800, height: 1200 },
}));

vi.mock('@/lib/prisma', () => {
  const ledger = {
    async create(args: { data: { eventId: string; status: string; claimedAt: Date } }) {
      mocks.ledgerCreate(args);
      if (mocks.rows.has(args.data.eventId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row = {
        eventId: args.data.eventId,
        status: args.data.status,
        claimedAt: args.data.claimedAt,
      };
      mocks.rows.set(row.eventId, row);
      return row;
    },
    async findUnique(args: { where: { eventId: string } }) {
      return mocks.rows.get(args.where.eventId) ?? null;
    },
    async updateMany(args: {
      where: { eventId: string; OR: Array<{ status: string; claimedAt?: { lt: Date } }> };
      data: { status: string; claimedAt: Date };
    }) {
      const row = mocks.rows.get(args.where.eventId);
      const matches =
        row !== undefined &&
        args.where.OR.some(
          (cond) =>
            cond.status === row.status &&
            (cond.claimedAt === undefined ||
              (row.claimedAt !== null && row.claimedAt.getTime() < cond.claimedAt.lt.getTime())),
        );
      if (!row || !matches) {
        return { count: 0 };
      }
      row.status = args.data.status;
      row.claimedAt = args.data.claimedAt;
      return { count: 1 };
    },
    async update(args: { where: { eventId: string }; data: { status: string } }) {
      const row = mocks.rows.get(args.where.eventId);
      if (!row) {
        throw new Error('registro ausente no ledger fake');
      }
      row.status = args.data.status;
      return row;
    },
  };
  return {
    prisma: {
      ebookWebhookEvent: ledger,
      ebookOrder: { findUnique: mocks.orderFindUnique },
      ebookAccessToken: {},
      $transaction: vi.fn(),
    },
  };
});

const stripeSdk = new Stripe('sk_test_placeholder');

// Import dinamico DEPOIS do resetModules: cada caso rele env e mocks.
async function loadRoute() {
  return import('@/app/api/v1/webhooks/stripe/ebooks/route');
}

function eventPayload(id: string, type: string, object: Record<string, unknown>): string {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    api_version: '2025-01-27.acacia',
    created: 1_760_875_200,
    livemode: false,
    data: { object },
  });
}

function ebookSession(sessionId: string): Record<string, unknown> {
  return {
    id: sessionId,
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { kind: 'ebook', ebook_slug: 'ebook-teste' },
  };
}

interface RequestOptions {
  payload: string;
  signature?: string | null;
  headers?: Record<string, string>;
}

function buildRequest({ payload, signature, headers = {} }: RequestOptions): NextRequest {
  const sig =
    signature === undefined
      ? stripeSdk.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET })
      : signature;
  return new NextRequest(ROUTE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
      ...(sig === null ? {} : { 'stripe-signature': sig }),
      ...headers,
    },
    body: payload,
  });
}

async function post(options: RequestOptions) {
  const { POST } = await loadRoute();
  return POST(buildRequest(options));
}

async function drain(): Promise<void> {
  while (mocks.afterTasks.length > 0) {
    const task = mocks.afterTasks.shift();
    if (task) {
      await task();
    }
  }
}

describe('POST /api/v1/webhooks/stripe/ebooks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.afterTasks.length = 0;
    mocks.rows.clear();
    vi.stubEnv('STRIPE_EBOOKS_WEBHOOK_SECRET', TEST_SECRET);
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
      resetAt: Date.now() + 60_000,
    });
    mocks.fulfill.mockResolvedValue(undefined);
    mocks.orderFindUnique.mockResolvedValue(null);
    mocks.retrieve.mockImplementation(async (id: string) => ({ id, metadata: { kind: 'ebook' } }));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rate limit estourado devolve 429 sem tocar o ledger', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() });

    const res = await post({ payload: eventPayload('evt_rl', 'customer.created', { id: 'cus_1' }) });

    expect(res.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('webhook:203.0.113.9', {
      maxRequests: 100,
      windowMs: 60_000,
    });
    expect(mocks.ledgerCreate).not.toHaveBeenCalled();
  });

  it('modulo exporta so POST, runtime e dynamic', async () => {
    const mod = await loadRoute();

    expect(Object.keys(mod).sort()).toEqual(['POST', 'dynamic', 'runtime']);
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });

  it('sem segredo configurado devolve 503 webhook_not_configured', async () => {
    vi.stubEnv('STRIPE_EBOOKS_WEBHOOK_SECRET', '');

    const res = await post({ payload: eventPayload('evt_cfg', 'customer.created', { id: 'cus_1' }) });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'webhook_not_configured' });
    expect(mocks.ledgerCreate).not.toHaveBeenCalled();
  });

  it('sem header stripe-signature devolve 400 missing_signature', async () => {
    const res = await post({
      payload: eventPayload('evt_sig', 'customer.created', { id: 'cus_1' }),
      signature: null,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_signature' });
  });

  it('corpo acima de 262144 bytes devolve 413', async () => {
    const res = await post({ payload: 'a'.repeat(262_145), signature: 't=1,v1=abc' });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
    expect(mocks.ledgerCreate).not.toHaveBeenCalled();
  });

  it('checkout de ebook assinado devolve 200 accepted e agenda uma tarefa', async () => {
    const res = await post({
      payload: eventPayload('evt_ok', 'checkout.session.completed', ebookSession('cs_test_ok')),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, status: 'accepted' });
    expect(mocks.afterTasks).toHaveLength(1);
    expect(mocks.fulfill).not.toHaveBeenCalled();

    await drain();

    expect(mocks.fulfill).toHaveBeenCalledWith({
      checkoutSessionId: 'cs_test_ok',
      eventId: 'evt_ok',
      eventType: 'checkout.session.completed',
    });
    expect(mocks.rows.get('evt_ok')?.status).toBe('PROCESSED');
  });

  it('segunda entrega do mesmo evento depois do processamento devolve duplicate', async () => {
    const payload = eventPayload('evt_dup', 'checkout.session.completed', ebookSession('cs_test_dup'));

    await post({ payload });
    await drain();
    const res = await post({ payload });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, status: 'duplicate' });
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
  });

  it('evento fora da lista devolve 200 ignored', async () => {
    const res = await post({ payload: eventPayload('evt_ign', 'customer.created', { id: 'cus_1' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, status: 'ignored' });
    expect(mocks.rows.get('evt_ign')?.status).toBe('IGNORED');
  });

  it('reembolso de pagamento de ebook sem pedido devolve 500 e marca FAILED', async () => {
    const res = await post({
      payload: eventPayload('evt_ref', 'charge.refunded', {
        id: 'ch_test_ref',
        object: 'charge',
        payment_intent: 'pi_test_sem_pedido',
        amount_refunded: 1990,
        refunded: true,
      }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'processing_failed' });
    expect(mocks.retrieve).toHaveBeenCalledWith('pi_test_sem_pedido');
    expect(mocks.rows.get('evt_ref')?.status).toBe('FAILED');
  });
});
