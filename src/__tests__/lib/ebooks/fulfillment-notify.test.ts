// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { EbookFulfillmentError } from '@/lib/ebooks/errors';
import { EBOOK_EMAIL_SEND_ATTEMPTS, type EbookFulfillmentDeps } from '@/lib/ebooks/fulfillment';
import {
  notifyEbookAsyncPaymentFailed,
  notifyEbookRefund,
  recordEbookDispute,
  type EbookNotifyDeps,
} from '@/lib/ebooks/fulfillment-notify';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';
import { EbookEmailSendError, type EbookEmailMessage } from '@/services/ebook-email.service';

import { regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

// Notificacoes de falha assincrona, reembolso e disputa (D-C10) com o mesmo
// Prisma em memoria do fulfillment.test.ts (copiado: sem helper compartilhado)
// e Resend fake. Chaves e emails sao placeholders, nunca valores reais.

const entry = ebookCatalogEntrySchema.parse(regressionEbookInput);
const PRICE_ID = 'price_test_regression';
const SESSION_ID = 'cs_test_fulfillment_1';
const BUYER = 'comprador@example.com';
const APP_URL = 'https://app.example.com';
const NOW = new Date('2026-10-19T12:00:00Z');

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
      async findMany({ where }: { where: Row }) {
        return state.events
          .filter((e) => matches(e as unknown as Row, where))
          .map((e) => ({ ...e }));
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
  deps: EbookNotifyDeps;
  db: ReturnType<typeof createFakePrisma>;
  sent: EbookEmailMessage[];
  send: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
}

function makeHarness(
  options: { session?: Stripe.Checkout.Session; config?: Partial<EbookFulfillmentDeps['config']> } = {},
): Harness {
  const db = createFakePrisma();
  const sent: EbookEmailMessage[] = [];
  const session = options.session ?? makeSession({ payment_status: 'unpaid' });
  const retrieve = vi.fn(async () => session);
  let msg = 0;
  const send = vi.fn(async (message: EbookEmailMessage) => {
    sent.push(message);
    return { id: `re_msg_${++msg}` };
  });
  const deps: EbookNotifyDeps = {
    prisma: db.client as unknown as EbookFulfillmentDeps['prisma'],
    stripe: { checkout: { sessions: { retrieve } } } as unknown as EbookFulfillmentDeps['stripe'],
    catalog: { getBySlug: (slug) => (slug === entry.slug ? entry : undefined) },
    priceIdFor: () => PRICE_ID,
    email: { send, getState: vi.fn(async () => 'pending' as const) },
    config: {
      resendApiKey: 're_test_placeholder',
      emailFrom: 'Corgly <ebooks@example.com>',
      appUrl: `${APP_URL}/`,
      ...options.config,
    },
    sleep: vi.fn(async () => undefined),
  };
  return { deps, db, sent, send, retrieve };
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
    deliveryStatus: 'SENT',
    deliveryClaimId: null,
    deliveryClaimedAt: null,
    deliveryAttempts: 1,
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

function asyncFailed(h: Harness, eventId = 'evt_async_1') {
  return notifyEbookAsyncPaymentFailed({ checkoutSessionId: SESSION_ID, eventId }, h.deps);
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
    .flatMap((spy) =>
      spy.mock.calls.map((call: unknown[]) =>
        call.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '),
      ),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// async_payment_failed
// ---------------------------------------------------------------------------

describe('notifyEbookAsyncPaymentFailed', () => {
  it('cria pedido FAILED sem token e envia 1 email async_failed', async () => {
    const h = makeHarness();
    const result = await asyncFailed(h);

    expect(result.status).toBe('sent');
    const [order] = h.db.state().orders;
    expect(order?.paymentStatus).toBe('FAILED');
    expect(h.db.state().tokens).toHaveLength(0);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.to).toBe(BUYER);
    expect(h.sent[0]?.idempotencyKey).toBe(`ebook-async-failed:${SESSION_ID}`);
    // retryUrl sem barra dupla, apontando para a pagina do ebook
    expect(h.sent[0]?.text).toContain(`${APP_URL}/ebooks/${entry.slug}`);
    expect(h.sent[0]?.text).not.toContain('//ebooks');
    expect(h.db.state().events).toEqual([
      expect.objectContaining({
        orderId: order?.id,
        event: 'async_failed_email',
        result: 'ok',
        detail: 'event:evt_async_1 resend:re_msg_1',
      }),
    ]);
  });

  it('o mesmo evento repetido nao reenvia', async () => {
    const h = makeHarness();
    await asyncFailed(h);
    const again = await asyncFailed(h);
    expect(again.status).toBe('already_sent');
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.db.state().orders).toHaveLength(1);
  });

  it('evento distinto do mesmo pedido nao reenvia (idempotencia por pedido)', async () => {
    const h = makeHarness();
    await asyncFailed(h, 'evt_async_1');
    const other = await asyncFailed(h, 'evt_async_2');
    expect(other.status).toBe('already_sent');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it.each(['ASYNC_PENDING', 'PENDING'])('pedido %s existente vira FAILED e recebe o aviso', async (status) => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: status, deliveryStatus: 'PENDING', deliveryAttempts: 0 });
    const result = await asyncFailed(h);
    expect(result).toEqual({ status: 'sent', orderId: 'ord_seed' });
    expect(h.db.state().orders[0]?.paymentStatus).toBe('FAILED');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it.each(['PAID', 'REFUNDED'])('pedido %s nao e rebaixado nem recebe aviso de falha', async (status) => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: status });
    const result = await asyncFailed(h);
    expect(result.status).toBe('skipped');
    expect(h.db.state().orders[0]?.paymentStatus).toBe(status);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.state().events).toHaveLength(0);
  });

  it('sessao que nao e de ebook retorna sem escrever', async () => {
    const h = makeHarness({ session: makeSession({ metadata: { kind: 'subscription' } }) });
    const result = await asyncFailed(h);
    expect(result.status).toBe('not_ebook');
    expect(h.db.state().orders).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('slug fora do catalogo lanca UNKNOWN_EBOOK permanente', async () => {
    const h = makeHarness({
      session: makeSession({ payment_status: 'unpaid', metadata: { kind: 'ebook', ebook_slug: 'nao-existe' } }),
    });
    const err = await captureFulfillmentError(asyncFailed(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_UNKNOWN_EBOOK');
    expect(err.transient).toBe(false);
    expect(h.db.state().orders).toHaveLength(0);
  });

  it('sessao sem email lanca BUYER_EMAIL_MISSING sem criar pedido', async () => {
    const h = makeHarness({
      session: makeSession({ payment_status: 'unpaid', customer_details: null, customer_email: null }),
    });
    const err = await captureFulfillmentError(asyncFailed(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_BUYER_EMAIL_MISSING');
    expect(h.db.state().orders).toHaveLength(0);
  });

  it('config de envio ausente lanca CONFIG_MISSING transiente sem enviar', async () => {
    const h = makeHarness({ config: { resendApiKey: '' } });
    const err = await captureFulfillmentError(asyncFailed(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_CONFIG_MISSING');
    expect(err.transient).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// charge.refunded
// ---------------------------------------------------------------------------

describe('notifyEbookRefund', () => {
  it.each([
    [true, 'refund_full'],
    [false, 'refund_partial'],
  ])('full=%s envia o kind %s com chave por evento', async (full) => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' });
    const result = await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full }, h.deps);

    expect(result).toEqual({ status: 'sent', orderId: 'ord_seed' });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.idempotencyKey).toBe('ebook-refund:ord_seed:evt_r1');
    expect(h.db.state().events).toEqual([
      expect.objectContaining({ event: 'refund_email', result: 'ok', detail: 'event:evt_r1 resend:re_msg_1' }),
    ]);
    expect(h.db.state().tokens).toHaveLength(0);
  });

  it('total e parcial produzem emails diferentes', async () => {
    const full = makeHarness();
    seedOrder(full);
    await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, full.deps);
    const partial = makeHarness();
    seedOrder(partial);
    await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: false }, partial.deps);
    expect(full.sent[0]?.subject).not.toBe(partial.sent[0]?.subject);
  });

  it('eventId repetido nao reenvia', async () => {
    const h = makeHarness();
    seedOrder(h);
    await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, h.deps);
    const again = await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, h.deps);
    expect(again.status).toBe('already_sent');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('evt_1 ja enviado nao bloqueia evt_12 (igualdade, nao prefixo)', async () => {
    const h = makeHarness();
    seedOrder(h);
    await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_1', full: false }, h.deps);
    const second = await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_12', full: false }, h.deps);
    expect(second.status).toBe('sent');
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('evt_12 ja enviado nao bloqueia evt_1', async () => {
    const h = makeHarness();
    seedOrder(h);
    await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_12', full: false }, h.deps);
    const second = await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_1', full: false }, h.deps);
    expect(second.status).toBe('sent');
  });

  it('evento rejected anterior nao bloqueia nova tentativa do mesmo eventId', async () => {
    const h = makeHarness();
    seedOrder(h);
    h.db.state().events.push({
      id: 'evt_old',
      orderId: 'ord_seed',
      event: 'refund_email',
      result: 'rejected',
      detail: 'event:evt_r1 status:422',
      createdAt: NOW,
    });
    const result = await notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, h.deps);
    expect(result.status).toBe('sent');
  });

  it('pedido inexistente lanca ORDER_NOT_FOUND permanente', async () => {
    const h = makeHarness();
    const err = await captureFulfillmentError(
      notifyEbookRefund({ orderId: 'ord_ausente', eventId: 'evt_r1', full: true }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_ORDER_NOT_FOUND');
    expect(err.transient).toBe(false);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('recusa permanente grava rejected e lanca EMAIL_REJECTED', async () => {
    const h = makeHarness();
    seedOrder(h);
    h.send.mockRejectedValue(new EbookEmailSendError('recusado', { transient: false, status: 422 }));
    const err = await captureFulfillmentError(
      notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_REJECTED');
    expect(err.transient).toBe(false);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.db.state().events).toEqual([
      expect.objectContaining({ event: 'refund_email', result: 'rejected', detail: 'event:evt_r1 status:422' }),
    ]);
  });

  it('transiente esgotado lanca EMAIL_UNAVAILABLE sem evento ok', async () => {
    const h = makeHarness();
    seedOrder(h);
    h.send.mockRejectedValue(new EbookEmailSendError('indisponivel', { transient: true, status: 503 }));
    const err = await captureFulfillmentError(
      notifyEbookRefund({ orderId: 'ord_seed', eventId: 'evt_r1', full: true }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE');
    expect(err.transient).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(EBOOK_EMAIL_SEND_ATTEMPTS);
    const keys = new Set(h.send.mock.calls.map((call) => (call[0] as EbookEmailMessage).idempotencyKey));
    expect(keys).toEqual(new Set(['ebook-refund:ord_seed:evt_r1']));
    expect(h.db.state().events).toHaveLength(0);
  });

  it('async_failed transiente esgotado tambem nao grava evento ok', async () => {
    const h = makeHarness();
    h.send.mockRejectedValue(new EbookEmailSendError('timeout', { transient: true, status: null }));
    const err = await captureFulfillmentError(asyncFailed(h));
    expect(err.code).toBe('EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE');
    expect(h.db.state().events).toHaveLength(0);
    expect(h.db.state().orders[0]?.paymentStatus).toBe('FAILED');
  });
});

// ---------------------------------------------------------------------------
// charge.dispute.created
// ---------------------------------------------------------------------------

describe('recordEbookDispute', () => {
  it('registra dispute_recorded sem email e e idempotente por eventId', async () => {
    const h = makeHarness();
    seedOrder(h, { paymentStatus: 'DISPUTED' });
    const first = await recordEbookDispute({ orderId: 'ord_seed', eventId: 'evt_d1' }, h.deps);
    const again = await recordEbookDispute({ orderId: 'ord_seed', eventId: 'evt_d1' }, h.deps);

    expect(first.status).toBe('sent');
    expect(again.status).toBe('already_sent');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.state().events).toEqual([
      expect.objectContaining({ event: 'dispute_recorded', result: 'ok', detail: 'event:evt_d1' }),
    ]);
  });

  it('evt_1 registrado nao bloqueia evt_12', async () => {
    const h = makeHarness();
    seedOrder(h);
    await recordEbookDispute({ orderId: 'ord_seed', eventId: 'evt_1' }, h.deps);
    const second = await recordEbookDispute({ orderId: 'ord_seed', eventId: 'evt_12' }, h.deps);
    expect(second.status).toBe('sent');
    expect(h.db.state().events).toHaveLength(2);
  });

  it('pedido inexistente lanca ORDER_NOT_FOUND', async () => {
    const h = makeHarness();
    const err = await captureFulfillmentError(
      recordEbookDispute({ orderId: 'ord_ausente', eventId: 'evt_d1' }, h.deps),
    );
    expect(err.code).toBe('EBOOK_FULFILLMENT_ORDER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Logs (D-C13)
// ---------------------------------------------------------------------------

describe('logs das notificacoes', () => {
  it('usam o prefixo e nunca contem email, link ou chave', async () => {
    const h = makeHarness();
    await asyncFailed(h);
    seedOrder(h, { id: 'ord_r', checkoutSessionId: 'cs_outro' });
    await notifyEbookRefund({ orderId: 'ord_r', eventId: 'evt_r1', full: true }, h.deps);
    h.send.mockRejectedValue(new EbookEmailSendError('recusado', { transient: false, status: 400 }));
    await captureFulfillmentError(
      notifyEbookRefund({ orderId: 'ord_r', eventId: 'evt_r2', full: false }, h.deps),
    );
    await recordEbookDispute({ orderId: 'ord_r', eventId: 'evt_d1' }, h.deps);

    const text = loggedText();
    expect(text).toContain('[ebooks-fulfillment]');
    expect(text).not.toContain(BUYER);
    expect(text).not.toContain('https://');
    expect(text).not.toContain('re_test_placeholder');
    expect(text).not.toContain('Prisma');
  });
});
