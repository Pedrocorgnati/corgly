// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { hashEbookAccessToken } from '@/lib/ebooks/access-token';
import { EbookFulfillmentError } from '@/lib/ebooks/errors';
import {
  EBOOK_DELIVERY_LEASE_MS,
  EBOOK_EMAIL_SEND_ATTEMPTS,
  EBOOK_SUCCESS_RECONCILE_MIN_INTERVAL_MS,
  fulfillEbookCheckoutSession,
  reconcileEbookDeliveryOnSuccessPage,
  reconcileEbookDeliveryStatus,
  resetEbookSuccessReconcileThrottleForTests,
  type EbookFulfillmentDeps,
} from '@/lib/ebooks/fulfillment';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';
import {
  EbookEmailSendError,
  type EbookEmailMessage,
  type EbookEmailState,
} from '@/services/ebook-email.service';

import { regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

// Nucleo do fulfillment (D-C3..D-C7, D-C9) com Prisma em memoria cuja
// `$transaction` desfaz tudo em erro, Stripe e Resend fake. Porta os casos de
// ebook-delivery, kv-delivery-ledger e checkout-session-fallback (D-C12).
// Chaves e emails sao placeholders, nunca valores reais.

const entry = ebookCatalogEntrySchema.parse(regressionEbookInput);
const PRICE_ID = 'price_test_regression';
const SESSION_ID = 'cs_test_fulfillment_1';
const BUYER = 'comprador@example.com';
const APP_URL = 'https://app.example.com';
const NOW = new Date('2026-10-19T12:00:00Z');
const TOKEN = 'A'.repeat(43);

// ---------------------------------------------------------------------------
// Prisma em memoria
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  checkoutSessionId: string;
  stripePaymentIntentId: string | null;
  slug: string;
  email: string;
  locale: string;
  amountTotal: number;
  currency: string;
  paymentStatus: string;
  deliveryStatus: string;
  deliveryClaimId: string | null;
  deliveryClaimedAt: Date | null;
  deliveryAttempts: number;
  purchasedAt: Date;
  billingCountry: string | null;
  cardCountry: string | null;
  withdrawalWaiverAt: Date | null;
  withdrawalWaiverVersion: string | null;
}

interface TokenRow {
  id: string;
  orderId: string;
  tokenHash: string;
  revokedAt: Date | null;
  revokedReason: string | null;
}

interface EventRow {
  id: string;
  orderId: string;
  event: string;
  result: string;
  detail: string | null;
  createdAt: Date;
}

type Row = Record<string, unknown>;

interface FakeState {
  orders: OrderRow[];
  tokens: TokenRow[];
  events: EventRow[];
}

interface FakeHooks {
  /** Forca `count` de um updateMany de pedido (antes de aplicar). */
  orderUpdateManyOverride?: (where: Row) => number | undefined;
  /** Lanca ao criar o evento com esse nome. */
  failEventCreate?: (event: string) => boolean;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((alt) => matches(row, alt));
    const value = row[key];
    if (cond === null) return value === null;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond === 'object') {
      const op = cond as { lt?: Date; in?: unknown[] };
      if (op.in) return op.in.includes(value);
      if (op.lt) return value instanceof Date && value.getTime() < op.lt.getTime();
      return false;
    }
    return value === cond;
  });
}

function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[key] = (row[key] as number) + (value as { increment: number }).increment;
    } else {
      row[key] = value;
    }
  }
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

function createFakePrisma(hooks: FakeHooks = {}) {
  const state: FakeState = { orders: [], tokens: [], events: [] };
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const clone = (): FakeState => structuredClone(state);

  const client = {
    ebookOrder: {
      async create({ data }: { data: Row }) {
        if (state.orders.some((o) => o.checkoutSessionId === data.checkoutSessionId)) {
          throw uniqueViolation();
        }
        const row: OrderRow = {
          id: nextId('ord'),
          deliveryStatus: 'PENDING',
          deliveryClaimId: null,
          deliveryClaimedAt: null,
          deliveryAttempts: 0,
          ...(data as unknown as Omit<OrderRow, 'id'>),
        } as OrderRow;
        state.orders.push(row);
        return { ...row };
      },
      async findUnique({ where }: { where: Row }) {
        const row = state.orders.find((o) => matches(o as unknown as Row, where));
        return row ? { ...row } : null;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const forced = hooks.orderUpdateManyOverride?.(where);
        if (forced !== undefined) return { count: forced };
        const rows = state.orders.filter((o) => matches(o as unknown as Row, where));
        for (const row of rows) applyData(row as unknown as Row, data);
        return { count: rows.length };
      },
    },
    ebookAccessToken: {
      async create({ data }: { data: { orderId: string; tokenHash: string } }) {
        const row: TokenRow = { id: nextId('tok'), revokedAt: null, revokedReason: null, ...data };
        state.tokens.push(row);
        return { ...row };
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const rows = state.tokens.filter((t) => matches(t as unknown as Row, where));
        for (const row of rows) applyData(row as unknown as Row, data);
        return { count: rows.length };
      },
    },
    ebookDeliveryEvent: {
      async create({ data }: { data: Omit<EventRow, 'id' | 'createdAt'> }) {
        if (hooks.failEventCreate?.(data.event)) throw new Error('falha simulada de escrita');
        const row: EventRow = {
          id: nextId('evt'),
          createdAt: new Date(NOW.getTime() + seq),
          ...data,
        };
        state.events.push(row);
        return { ...row };
      },
      async findFirst({ where }: { where: Row }) {
        const rows = state.events
          .filter((e) => matches(e as unknown as Row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ? { ...rows[0] } : null;
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snapshot = clone();
      try {
        return await fn(client);
      } catch (err) {
        state.orders = snapshot.orders;
        state.tokens = snapshot.tokens;
        state.events = snapshot.events;
        throw err;
      }
    },
  };

  return { client, state: () => state };
}

// ---------------------------------------------------------------------------
// Sessao Stripe fake
// ---------------------------------------------------------------------------

interface SessionOverrides {
  metadata?: Record<string, string>;
  payment_status?: string | undefined;
  amount_total?: number | null;
  currency?: string | null;
  customer_details?: { email?: string | null; address?: { country?: string | null } } | null;
  customer_email?: string | null;
  line_items?: { data: Array<{ quantity?: number | null; price?: { id: string } | null }> } | null;
  payment_intent?: unknown;
}

function makeSession(overrides: SessionOverrides = {}): Stripe.Checkout.Session {
  const base = {
    id: SESSION_ID,
    object: 'checkout.session',
    created: Math.floor(NOW.getTime() / 1000),
    metadata: {
      kind: 'ebook',
      ebook_slug: entry.slug,
      withdrawal_waiver_version: 'v1',
      withdrawal_waiver_at: '2026-10-19T11:59:00.000Z',
    },
    payment_status: 'paid',
    amount_total: entry.unitAmount,
    currency: entry.currency,
    customer_details: { email: BUYER, address: { country: 'br' } },
    customer_email: null,
    line_items: { data: [{ quantity: 1, price: { id: PRICE_ID } }] },
    payment_intent: {
      id: 'pi_test_1',
      latest_charge: { payment_method_details: { card: { country: 'US' } } },
    },
  };
  return { ...base, ...overrides } as unknown as Stripe.Checkout.Session;
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

interface Harness {
  deps: EbookFulfillmentDeps;
  db: ReturnType<typeof createFakePrisma>;
  sent: EbookEmailMessage[];
  retrieve: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  checkPdf: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
}

function makeHarness(
  options: {
    session?: Stripe.Checkout.Session;
    hooks?: FakeHooks;
    config?: Partial<EbookFulfillmentDeps['config']>;
  } = {},
): Harness {
  const db = createFakePrisma(options.hooks);
  const sent: EbookEmailMessage[] = [];
  const session = options.session ?? makeSession();
  const retrieve = vi.fn(async () => session);
  const send = vi.fn(async (message: EbookEmailMessage) => {
    sent.push(message);
    return { id: 're_msg_1' };
  });
  const getState = vi.fn(async (): Promise<EbookEmailState> => 'pending');
  const checkPdf = vi.fn(async () => undefined);
  const sleep = vi.fn(async () => undefined);
  let uuid = 0;

  const deps: EbookFulfillmentDeps = {
    prisma: db.client as unknown as EbookFulfillmentDeps['prisma'],
    stripe: {
      checkout: { sessions: { retrieve } },
    } as unknown as EbookFulfillmentDeps['stripe'],
    catalog: { getBySlug: (slug) => (slug === entry.slug ? entry : undefined) },
    priceIdFor: () => PRICE_ID,
    email: { send, getState },
    config: {
      resendApiKey: 're_test_placeholder',
      emailFrom: 'Corgly <ebooks@example.com>',
      appUrl: APP_URL,
      ...options.config,
    },
    checkPdf,
    now: () => NOW,
    sleep,
    randomUUID: () => `claim-${++uuid}`,
    generateToken: () => TOKEN,
  };

  return { deps, db, sent, retrieve, send, getState, checkPdf, sleep };
}

function seedOrder(h: Harness, overrides: Partial<OrderRow> = {}): OrderRow {
  const row: OrderRow = {
    id: 'ord_seed',
    checkoutSessionId: SESSION_ID,
    stripePaymentIntentId: 'pi_test_1',
    slug: entry.slug,
    email: BUYER,
    locale: entry.locale,
    amountTotal: entry.unitAmount,
    currency: entry.currency,
    paymentStatus: 'PAID',
    deliveryStatus: 'PENDING',
    deliveryClaimId: null,
    deliveryClaimedAt: null,
    deliveryAttempts: 0,
    purchasedAt: NOW,
    billingCountry: null,
    cardCountry: null,
    withdrawalWaiverAt: null,
    withdrawalWaiverVersion: null,
    ...overrides,
  };
  h.db.state().orders.push(row);
  return row;
}

async function captureFulfillmentError(promise: Promise<unknown>): Promise<EbookFulfillmentError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(EbookFulfillmentError);
    return err as EbookFulfillmentError;
  }
  throw new Error('esperava EbookFulfillmentError');
}

function fulfill(h: Harness, trigger: 'webhook' | 'success_page' | 'recovery' = 'webhook') {
  return fulfillEbookCheckoutSession({ checkoutSessionId: SESSION_ID, trigger }, h.deps);
}

function stripeError(raw: { type: string; statusCode?: number; code?: string }) {
  // generate() nao conhece api_connection_error (cai em StripeUnknownError)
  if (raw.type === 'api_connection_error') {
    return new Stripe.errors.StripeConnectionError({ message: 'falha fake', ...raw } as never);
  }
  return Stripe.errors.StripeError.generate({ message: 'falha fake', ...raw } as never);
}

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  consoleSpies = (['error', 'warn', 'info', 'debug', 'log'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedText(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Entrega (porta ebook-delivery.test.ts)
// ---------------------------------------------------------------------------

describe('fulfillEbookCheckoutSession: entrega', () => {
  it('envia com acesso permanente e devolve accepted', async () => {
    const h = makeHarness();
    const result = await fulfill(h);

    expect(result.status).toBe('accepted');
    expect(result.orderId).toBeDefined();
    expect(Object.keys(result).sort()).toEqual(['orderId', 'status']);

    const [order] = h.db.state().orders;
    expect(order).toMatchObject({
      paymentStatus: 'PAID',
      deliveryStatus: 'ACCEPTED',
      email: BUYER,
      billingCountry: 'BR',
      cardCountry: 'US',
      stripePaymentIntentId: 'pi_test_1',
      withdrawalWaiverVersion: 'v1',
      deliveryAttempts: 1,
    });
    expect(order?.withdrawalWaiverAt?.toISOString()).toBe('2026-10-19T11:59:00.000Z');

    expect(h.db.state().tokens).toHaveLength(1);
    expect(h.db.state().tokens[0]?.tokenHash).toBe(hashEbookAccessToken(TOKEN));
    expect(h.db.state().tokens[0]?.tokenHash).not.toBe(TOKEN);

    expect(h.sent).toHaveLength(1);
    const [message] = h.sent;
    expect(message?.to).toBe(BUYER);
    expect(message?.idempotencyKey).toBe(`ebook-delivery:${SESSION_ID}`);
    expect(message?.html).toContain(`${APP_URL}/ebooks/acesso/${TOKEN}`);
    expect(message?.text).toContain(`${APP_URL}/ebooks/acesso/${TOKEN}/desistir`);

    const events = h.db.state().events.map((e) => [e.event, e.result, e.detail]);
    expect(events).toEqual([
      ['email_sending', 'ok', null],
      ['email_accepted', 'ok', 'resend:re_msg_1'],
    ]);
  });

  it('le o expand de line_items e latest_charge com timeout', async () => {
    const h = makeHarness();
    await fulfill(h);
    expect(h.retrieve).toHaveBeenCalledWith(
      SESSION_ID,
      { expand: ['line_items', 'payment_intent.latest_charge'] },
      { timeout: 10_000 },
    );
  });

  it('cai para customer_email quando customer_details.email falta', async () => {
    const h = makeHarness({
      session: makeSession({ customer_details: null, customer_email: '  outro@example.com ' }),
    });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted' });
    expect(h.sent[0]?.to).toBe('outro@example.com');
  });

  it('fail-closed sem email: permanente e sem pedido', async () => {
    const h = makeHarness({
      session: makeSession({ customer_details: { email: null }, customer_email: null }),
    });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_BUYER_EMAIL_MISSING');
    expect(err.transient).toBe(false);
    expect(h.db.state().orders).toHaveLength(0);
  });

  it('nao entrega sessao unpaid: grava ASYNC_PENDING', async () => {
    const h = makeHarness({ session: makeSession({ payment_status: 'unpaid' }) });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'pending_payment' });
    expect(h.db.state().orders[0]?.paymentStatus).toBe('ASYNC_PENDING');
    expect(h.db.state().tokens).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('nao presume pagamento com payment_status ausente', async () => {
    const h = makeHarness({ session: makeSession({ payment_status: undefined }) });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'pending_payment' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('pedido ASYNC_PENDING vira PAID quando a sessao paga chega', async () => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: 'ASYNC_PENDING' });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted', orderId: 'ord_seed' });
    expect(h.db.state().orders[0]?.paymentStatus).toBe('PAID');
  });

  it.each([
    ['quantity omitido', { data: [{ price: { id: PRICE_ID } }] }],
    ['quantity > 1', { data: [{ quantity: 2, price: { id: PRICE_ID } }] }],
    ['price desconhecido', { data: [{ quantity: 1, price: { id: 'price_outro' } }] }],
    ['dois itens', { data: [{ quantity: 1, price: { id: PRICE_ID } }, { quantity: 1, price: { id: PRICE_ID } }] }],
    ['sem line_items', null],
  ])('%s aborta com LINE_ITEMS_MISMATCH antes de criar pedido', async (_name, lineItems) => {
    const h = makeHarness({ session: makeSession({ line_items: lineItems }) });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_LINE_ITEMS_MISMATCH');
    expect(err.transient).toBe(false);
    expect(h.db.state().orders).toHaveLength(0);
  });

  it('valor divergente aborta antes do PDF e do Resend', async () => {
    const h = makeHarness({ session: makeSession({ amount_total: entry.unitAmount + 1 }) });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_AMOUNT_MISMATCH');
    expect(h.checkPdf).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.state().orders).toHaveLength(0);
  });

  it('slug fora do catalogo e permanente', async () => {
    const h = makeHarness({
      session: makeSession({ metadata: { kind: 'ebook', ebook_slug: 'nao-existe' } }),
    });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_UNKNOWN_EBOOK');
  });

  it('metadata.kind diferente de ebook devolve not_ebook sem escrita', async () => {
    const h = makeHarness({ session: makeSession({ metadata: { kind: 'class_package' } }) });
    await expect(fulfill(h)).resolves.toEqual({ status: 'not_ebook' });
    expect(h.db.state()).toEqual({ orders: [], tokens: [], events: [] });
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each([
    ['REFUNDED', 'revoked'],
    ['DISPUTED', 'revoked'],
    ['FAILED', 'failed_payment'],
  ])('pedido %s nao entrega', async (paymentStatus, expected) => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus });
    await expect(fulfill(h)).resolves.toEqual({ status: expected, orderId: 'ord_seed' });
    expect(h.checkPdf).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('PARTIALLY_REFUNDED ainda entrega', async () => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: 'PARTIALLY_REFUNDED' });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted' });
  });

  it('trigger success_page usa o mesmo caminho e devolve o estado sem token', async () => {
    const h = makeHarness();
    const first = await fulfill(h, 'success_page');
    expect(first).toEqual({ status: 'accepted', orderId: expect.any(String) });
    const second = await fulfill(h, 'success_page');
    expect(second).toEqual({ status: 'accepted', orderId: first.orderId });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second)).not.toContain(TOKEN);
  });
});

// ---------------------------------------------------------------------------
// PDF e configuracao (pre-envio)
// ---------------------------------------------------------------------------

describe('fulfillEbookCheckoutSession: pre-envio', () => {
  it('PDF ausente/vazio/sem assinatura nao envia link morto: NEEDS_REVIEW sem token', async () => {
    const h = makeHarness();
    h.checkPdf.mockRejectedValueOnce(
      new EbookFulfillmentError('EBOOK_FULFILLMENT_PDF_UNAVAILABLE', 'PDF ausente', {
        transient: false,
      }),
    );
    const result = await fulfill(h);
    expect(result.status).toBe('needs_review');
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('NEEDS_REVIEW');
    expect(h.db.state().tokens).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.state().events.map((e) => [e.event, e.result, e.detail])).toEqual([
      ['needs_review', 'pdf_unavailable', 'EBOOK_FULFILLMENT_PDF_UNAVAILABLE'],
    ]);
  });

  it('erro temporario de disco libera o claim e relanca transiente', async () => {
    const h = makeHarness();
    h.checkPdf.mockRejectedValueOnce(
      new EbookFulfillmentError('EBOOK_FULFILLMENT_PDF_UNAVAILABLE', 'EIO', { transient: true }),
    );
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.transient).toBe(true);
    const [order] = h.db.state().orders;
    expect(order?.deliveryStatus).toBe('PENDING');
    expect(order?.deliveryClaimId).toBeNull();
    expect(h.db.state().tokens).toHaveLength(0);

    // o retry seguinte do webhook reivindica de novo e entrega
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted' });
    expect(h.db.state().orders[0]?.deliveryAttempts).toBe(2);
  });

  it('erro desconhecido do checkPdf vira PDF_UNAVAILABLE transiente', async () => {
    const h = makeHarness();
    h.checkPdf.mockRejectedValueOnce(new Error('boom'));
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(true);
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('PENDING');
  });

  it('RESEND_API_KEY vazia libera o claim para PENDING e lanca CONFIG_MISSING', async () => {
    const h = makeHarness({ config: { resendApiKey: '  ' } });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_CONFIG_MISSING');
    expect(err.transient).toBe(true);
    expect(err.message).toContain('RESEND_API_KEY');
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('PENDING');
    expect(h.db.state().tokens).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('CONFIG_MISSING nomeia so as envs ausentes', async () => {
    const h = makeHarness({ config: { emailFrom: '', appUrl: '' } });
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.message).toContain('EMAIL_FROM');
    expect(err.message).toContain('NEXT_PUBLIC_APP_URL');
    expect(err.message).not.toContain('RESEND_API_KEY');
  });
});

// ---------------------------------------------------------------------------
// Resend (passos 4-7)
// ---------------------------------------------------------------------------

describe('fulfillEbookCheckoutSession: envio', () => {
  it('Resend 400 persiste NEEDS_REVIEW e revoga o token', async () => {
    const h = makeHarness();
    h.send.mockRejectedValue(new EbookEmailSendError('400', { transient: false, status: 400 }));
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'needs_review' });

    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('NEEDS_REVIEW');
    expect(h.db.state().tokens[0]).toMatchObject({ revokedAt: NOW, revokedReason: 'not_delivered' });
    expect(h.db.state().events.at(-1)).toMatchObject({
      event: 'needs_review',
      result: 'email_rejected',
      detail: 'status:400',
    });
  });

  it.each([429, 503])('%i esgotado fica SENDING e lanca EMAIL_UNAVAILABLE', async (status) => {
    const h = makeHarness();
    h.send.mockRejectedValue(new EbookEmailSendError(String(status), { transient: true, status }));
    const err = await captureFulfillmentError(fulfill(h));

    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE');
    expect(err.transient).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(EBOOK_EMAIL_SEND_ATTEMPTS);
    expect(h.sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
    const keys = h.send.mock.calls.map((c) => (c[0] as EbookEmailMessage).idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([`ebook-delivery:${SESSION_ID}`]));
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('SENDING');
    expect(h.db.state().tokens[0]?.revokedAt).toBeNull();
    expect(h.db.state().events.at(-1)).toMatchObject({
      event: 'email_send_failed',
      result: 'transient',
      detail: `status:${status}`,
    });
  });

  it('erro de rede esgotado grava status:network', async () => {
    const h = makeHarness();
    h.send.mockRejectedValue(new TypeError('fetch failed'));
    await captureFulfillmentError(fulfill(h));
    expect(h.db.state().events.at(-1)?.detail).toBe('status:network');
  });

  it('transiente seguido de 2xx aceita na segunda tentativa', async () => {
    const h = makeHarness();
    h.send.mockRejectedValueOnce(new EbookEmailSendError('503', { transient: true, status: 503 }));
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted' });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.sleep).toHaveBeenCalledTimes(1);
  });

  it('falha na gravacao do evento email_accepted nao deixa ACCEPTED gravado', async () => {
    const h = makeHarness({ hooks: { failEventCreate: (event) => event === 'email_accepted' } });
    await expect(fulfill(h)).rejects.toThrow('falha simulada de escrita');
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('SENDING');
    expect(h.db.state().events.some((e) => e.event === 'email_accepted')).toBe(false);
  });

  it('falha na gravacao do evento de recusa nao deixa revisao nem revogacao gravadas', async () => {
    const h = makeHarness({ hooks: { failEventCreate: (event) => event === 'needs_review' } });
    h.send.mockRejectedValue(new EbookEmailSendError('422', { transient: false, status: 422 }));
    await expect(fulfill(h)).rejects.toThrow('falha simulada de escrita');
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('SENDING');
    expect(h.db.state().tokens[0]?.revokedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ledger e concorrencia (porta kv-delivery-ledger.test.ts)
// ---------------------------------------------------------------------------

describe('fulfillEbookCheckoutSession: claim e concorrencia', () => {
  it('chamadas concorrentes convergem num unico claim, um token e um POST', async () => {
    const h = makeHarness();
    const results = await Promise.all([
      fulfill(h, 'webhook'),
      fulfill(h, 'success_page'),
      fulfill(h, 'webhook'),
    ]);

    expect(h.db.state().orders).toHaveLength(1);
    expect(h.db.state().tokens).toHaveLength(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.db.state().orders[0]?.deliveryAttempts).toBe(1);
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
    for (const result of results) {
      expect(['accepted', 'in_progress']).toContain(result.status);
    }
  });

  it('claim com count 0 e pedido relido em PENDING devolve in_progress', async () => {
    let forced = false;
    const h = makeHarness({
      hooks: {
        orderUpdateManyOverride: (where) => {
          if (!forced && Array.isArray(where.OR)) {
            forced = true;
            return 0;
          }
          return undefined;
        },
      },
    });
    seedOrder(h);
    await expect(fulfill(h)).resolves.toEqual({ status: 'in_progress', orderId: 'ord_seed' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('claim com count 0 e pedido sumido na releitura e ORDER_NOT_FOUND permanente', async () => {
    let forced = false;
    const h: Harness = makeHarness({
      hooks: {
        orderUpdateManyOverride: (where) => {
          if (!forced && Array.isArray(where.OR)) {
            forced = true;
            h.db.state().orders.length = 0;
            return 0;
          }
          return undefined;
        },
      },
    });
    seedOrder(h);
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_ORDER_NOT_FOUND');
    expect(err.transient).toBe(false);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('claim perdido no passo 3 (transacao abortada) nao cria token nem faz POST', async () => {
    const h = makeHarness();
    h.checkPdf.mockImplementationOnce(async () => {
      // outro processo assume o claim entre o pre-envio e a transacao do token
      const order = h.db.state().orders[0];
      if (order) order.deliveryClaimId = 'claim-de-outro-processo';
    });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'in_progress' });
    expect(h.db.state().tokens).toHaveLength(0);
    expect(h.db.state().events).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('CLAIMED com lease vencido e reivindicado de novo', async () => {
    const h = makeHarness();
    seedOrder(h, {
      deliveryStatus: 'CLAIMED',
      deliveryClaimId: 'claim-antigo',
      deliveryClaimedAt: new Date(NOW.getTime() - EBOOK_DELIVERY_LEASE_MS - 1),
      deliveryAttempts: 1,
    });
    await expect(fulfill(h)).resolves.toMatchObject({ status: 'accepted' });
    expect(h.db.state().orders[0]?.deliveryAttempts).toBe(2);
  });

  it('CLAIMED dentro do lease devolve in_progress', async () => {
    const h = makeHarness();
    seedOrder(h, {
      deliveryStatus: 'CLAIMED',
      deliveryClaimId: 'claim-vivo',
      deliveryClaimedAt: new Date(NOW.getTime() - 1000),
    });
    await expect(fulfill(h)).resolves.toEqual({ status: 'in_progress', orderId: 'ord_seed' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('SENDING vencido vai para NEEDS_REVIEW sem novo POST (divergencia D-C6)', async () => {
    const h = makeHarness();
    seedOrder(h, {
      deliveryStatus: 'SENDING',
      deliveryClaimId: 'claim-antigo',
      deliveryClaimedAt: new Date(NOW.getTime() - EBOOK_DELIVERY_LEASE_MS - 1),
    });
    await expect(fulfill(h)).resolves.toEqual({ status: 'needs_review', orderId: 'ord_seed' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('NEEDS_REVIEW');
    expect(h.db.state().events.map((e) => [e.event, e.result])).toEqual([
      ['needs_review', 'delivery_outcome_unknown'],
    ]);
  });

  it('SENDING dentro do lease devolve in_progress sem mudanca', async () => {
    const h = makeHarness();
    seedOrder(h, {
      deliveryStatus: 'SENDING',
      deliveryClaimId: 'claim-vivo',
      deliveryClaimedAt: new Date(NOW.getTime() - 1000),
    });
    await expect(fulfill(h)).resolves.toEqual({ status: 'in_progress', orderId: 'ord_seed' });
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('SENDING');
  });

  it.each([
    ['ACCEPTED', 'accepted'],
    ['DELIVERED', 'delivered'],
    ['NEEDS_REVIEW', 'needs_review'],
  ])('pedido ja %s devolve o estado sem reenviar', async (deliveryStatus, expected) => {
    const h = makeHarness();
    seedOrder(h, { deliveryStatus });
    await expect(fulfill(h)).resolves.toEqual({ status: expected, orderId: 'ord_seed' });
    expect(h.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stripe (porta checkout-session-fallback.test.ts)
// ---------------------------------------------------------------------------

describe('fulfillEbookCheckoutSession: erros do retrieve', () => {
  it.each([
    ['5xx', { type: 'api_error', statusCode: 503 }],
    ['conexao', { type: 'api_connection_error' }],
    ['rate limit', { type: 'rate_limit_error', statusCode: 429 }],
  ])('%s e STRIPE_UNAVAILABLE transiente', async (_name, raw) => {
    const h = makeHarness();
    h.retrieve.mockRejectedValueOnce(stripeError(raw));
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE');
    expect(err.transient).toBe(true);
  });

  it('404 resource_missing e SESSION_NOT_FOUND permanente', async () => {
    const h = makeHarness();
    h.retrieve.mockRejectedValueOnce(
      stripeError({ type: 'invalid_request_error', statusCode: 404, code: 'resource_missing' }),
    );
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_SESSION_NOT_FOUND');
    expect(err.transient).toBe(false);
  });

  it.each([
    ['401', { type: 'authentication_error', statusCode: 401 }],
    ['400 sem resource_missing', { type: 'invalid_request_error', statusCode: 400 }],
  ])('%s e STRIPE_UNAVAILABLE permanente', async (_name, raw) => {
    const h = makeHarness();
    h.retrieve.mockRejectedValueOnce(stripeError(raw));
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).not.toContain('falha fake');
  });

  it('erro nao-Stripe vira STRIPE_UNAVAILABLE permanente sem vazar a mensagem', async () => {
    const h = makeHarness();
    h.retrieve.mockRejectedValueOnce(new Error(`detalhe com ${BUYER}`));
    const err = await captureFulfillmentError(fulfill(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE');
    expect(err.message).not.toContain(BUYER);
  });
});

// ---------------------------------------------------------------------------
// Reconcile (D-C9)
// ---------------------------------------------------------------------------

describe('reconcileEbookDeliveryOnSuccessPage', () => {
  beforeEach(() => {
    resetEbookSuccessReconcileThrottleForTests();
  });

  it('pedido ACCEPTED vira DELIVERED quando o Resend confirma', async () => {
    const h = makeHarness();
    const fulfilled = await fulfill(h, 'success_page');
    expect(fulfilled.status).toBe('accepted');
    h.getState.mockResolvedValueOnce('delivered');

    const result = await reconcileEbookDeliveryOnSuccessPage(fulfilled, h.deps);

    expect(result).toEqual({ status: 'delivered', orderId: fulfilled.orderId });
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('DELIVERED');
  });

  it('reload dentro do intervalo nao consulta o Resend de novo', async () => {
    let nowMs = NOW.getTime();
    const h = makeHarness();
    h.deps.now = () => new Date(nowMs);
    const fulfilled = await fulfill(h, 'success_page');

    await reconcileEbookDeliveryOnSuccessPage(fulfilled, h.deps);
    nowMs += EBOOK_SUCCESS_RECONCILE_MIN_INTERVAL_MS - 1;
    await expect(reconcileEbookDeliveryOnSuccessPage(fulfilled, h.deps)).resolves.toEqual(fulfilled);
    expect(h.getState).toHaveBeenCalledTimes(1);

    nowMs += 1;
    h.getState.mockResolvedValueOnce('delivered');
    await expect(reconcileEbookDeliveryOnSuccessPage(fulfilled, h.deps)).resolves.toMatchObject({
      status: 'delivered',
    });
    expect(h.getState).toHaveBeenCalledTimes(2);
  });

  it('erro na consulta mantem o resultado e o pedido ACCEPTED', async () => {
    const h = makeHarness();
    const fulfilled = await fulfill(h, 'success_page');
    h.getState.mockRejectedValueOnce(new EbookEmailSendError('503', { transient: true, status: 503 }));

    await expect(reconcileEbookDeliveryOnSuccessPage(fulfilled, h.deps)).resolves.toEqual(fulfilled);
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('ACCEPTED');
  });

  it('status diferente de accepted nao consulta o Resend', async () => {
    const h = makeHarness();
    const input = { status: 'delivered' as const, orderId: 'ord_seed' };
    await expect(reconcileEbookDeliveryOnSuccessPage(input, h.deps)).resolves.toBe(input);
    await expect(
      reconcileEbookDeliveryOnSuccessPage({ status: 'accepted' }, h.deps),
    ).resolves.toEqual({ status: 'accepted' });
    expect(h.getState).not.toHaveBeenCalled();
  });
});

describe('reconcileEbookDeliveryStatus', () => {
  it('progressao CLAIMED -> SENDING -> ACCEPTED -> DELIVERED via reconcile', async () => {
    const h = makeHarness();
    const observed: string[] = [];
    h.send.mockImplementationOnce(async (message: EbookEmailMessage) => {
      observed.push(h.db.state().orders[0]?.deliveryStatus ?? '');
      h.sent.push(message);
      return { id: 're_msg_9' };
    });
    h.checkPdf.mockImplementationOnce(async () => {
      observed.push(h.db.state().orders[0]?.deliveryStatus ?? '');
    });

    const { orderId } = await fulfill(h);
    observed.push(h.db.state().orders[0]?.deliveryStatus ?? '');
    h.getState.mockResolvedValueOnce('delivered');
    const reconciled = await reconcileEbookDeliveryStatus({ orderId: orderId ?? '' }, h.deps);
    observed.push(h.db.state().orders[0]?.deliveryStatus ?? '');

    expect(observed).toEqual(['CLAIMED', 'SENDING', 'ACCEPTED', 'DELIVERED']);
    expect(reconciled).toEqual({ status: 'delivered', orderId });
    expect(h.getState).toHaveBeenCalledWith('re_msg_9');
    expect(h.db.state().events.at(-1)).toMatchObject({
      event: 'email_delivered',
      result: 'ok',
      detail: 'resend:re_msg_9',
    });
  });

  it('reconcile 5xx nunca inventa estado', async () => {
    const h = makeHarness();
    const { orderId } = await fulfill(h);
    h.getState.mockRejectedValueOnce(new EbookEmailSendError('503', { transient: true, status: 503 }));
    const err = await captureFulfillmentError(
      reconcileEbookDeliveryStatus({ orderId: orderId ?? '' }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE');
    expect(err.transient).toBe(true);
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('ACCEPTED');
  });

  it('reconcile 404 do Resend e EMAIL_REJECTED permanente sem mudanca', async () => {
    const h = makeHarness();
    const { orderId } = await fulfill(h);
    h.getState.mockRejectedValueOnce(new EbookEmailSendError('404', { transient: false, status: 404 }));
    const err = await captureFulfillmentError(
      reconcileEbookDeliveryStatus({ orderId: orderId ?? '' }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_REJECTED');
    expect(err.transient).toBe(false);
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('ACCEPTED');
  });

  it('reconcile bounced -> NEEDS_REVIEW', async () => {
    const h = makeHarness();
    const { orderId } = await fulfill(h);
    h.getState.mockResolvedValueOnce('bounced');
    await expect(
      reconcileEbookDeliveryStatus({ orderId: orderId ?? '' }, h.deps),
    ).resolves.toEqual({ status: 'needs_review', orderId });
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('NEEDS_REVIEW');
    expect(h.db.state().events.at(-1)).toMatchObject({ event: 'needs_review', result: 'email_bounced' });
  });

  it('reconcile pending fica sem mudanca', async () => {
    const h = makeHarness();
    const { orderId } = await fulfill(h);
    const before = h.db.state().events.length;
    await expect(
      reconcileEbookDeliveryStatus({ orderId: orderId ?? '' }, h.deps),
    ).resolves.toEqual({ status: 'accepted', orderId });
    expect(h.db.state().orders[0]?.deliveryStatus).toBe('ACCEPTED');
    expect(h.db.state().events).toHaveLength(before);
  });

  it('evento email_accepted ausente -> email_accepted_missing sem GET', async () => {
    const h = makeHarness();
    seedOrder(h, { deliveryStatus: 'ACCEPTED' });
    await expect(reconcileEbookDeliveryStatus({ orderId: 'ord_seed' }, h.deps)).resolves.toEqual({
      status: 'needs_review',
      orderId: 'ord_seed',
    });
    expect(h.getState).not.toHaveBeenCalled();
    expect(h.db.state().events.map((e) => [e.event, e.result])).toEqual([
      ['needs_review', 'email_accepted_missing'],
    ]);
  });

  it('pedido fora de ACCEPTED devolve o estado sem GET', async () => {
    const h = makeHarness();
    seedOrder(h, { deliveryStatus: 'DELIVERED' });
    await expect(reconcileEbookDeliveryStatus({ orderId: 'ord_seed' }, h.deps)).resolves.toEqual({
      status: 'delivered',
      orderId: 'ord_seed',
    });
    expect(h.getState).not.toHaveBeenCalled();
  });

  it('pedido ausente e ORDER_NOT_FOUND permanente', async () => {
    const h = makeHarness();
    const err = await captureFulfillmentError(
      reconcileEbookDeliveryStatus({ orderId: 'ord_nao_existe' }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_ORDER_NOT_FOUND');
    expect(err.transient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Logs (D-C13)
// ---------------------------------------------------------------------------

describe('logs do fulfillment', () => {
  it('nunca contem email, token nem link', async () => {
    const recusado = makeHarness();
    recusado.send.mockRejectedValue(new EbookEmailSendError('422', { transient: false, status: 422 }));
    await fulfill(recusado);

    const esgotado = makeHarness();
    esgotado.send.mockRejectedValue(new EbookEmailSendError('503', { transient: true, status: 503 }));
    await captureFulfillmentError(fulfill(esgotado));

    const aceito = makeHarness();
    await fulfill(aceito);
    await fulfill(aceito);

    const text = loggedText();
    expect(text).toContain('[ebooks-fulfillment]');
    expect(text).not.toContain(BUYER);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('/ebooks/acesso/');
    expect(text).not.toContain('re_test_placeholder');
  });
});
