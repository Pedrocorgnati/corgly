// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { handleEbookWebhookRequest, type EbookWebhookDeps } from '@/lib/ebooks/webhook';
import { EBOOK_WEBHOOK_MAX_BODY_BYTES } from '@/lib/ebooks/webhook-config';
import { pendingEbookWebhookPorts, type EbookWebhookPorts } from '@/lib/ebooks/webhook-ports';

// No vitest nao ha loader de imagem do Next: o import estatico de webp vira
// string de URL, entao o mock traz um StaticImageData para o catalogo real.
vi.mock('../../../../content/ebooks/brazilian-portuguese-for-english-speakers/sales/cover.webp', () => ({
  default: { src: '/_next/static/media/cover.bp-en.webp', width: 800, height: 1200 },
}));

// Nucleo do webhook de ebooks (tabela D-B5, reembolso/disputa D-B9 e tarefa
// agendada D-B7) com Prisma em memoria, SDK Stripe real para assinar e ports
// fake. Segredo e chave sao placeholders, nunca valores reais.

const TEST_SECRET = 'whsec_test_placeholder';
const NOW = new Date('2026-10-19T12:00:00Z');
const stripeSdk = new Stripe('sk_test_placeholder');

type LedgerStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

interface LedgerRow {
  eventId: string;
  type: string;
  checkoutSessionId: string | null;
  status: LedgerStatus;
  claimedAt: Date | null;
  attempts: number;
  errorMessage: string | null;
  processedAt: Date | null;
}

type LedgerCondition =
  | { status: LedgerStatus }
  | { status: LedgerStatus; claimedAt: { lt: Date } };

interface OrderRow {
  id: string;
  stripePaymentIntentId: string;
  paymentStatus: string;
  refundedAmount: number;
  refundedAt: Date | null;
  disputeId: string | null;
  disputeStatus: string | null;
  disputedAt: Date | null;
}

interface TokenRow {
  id: string;
  orderId: string;
  revokedAt: Date | null;
  revokedReason: string | null;
}

interface FakeDb {
  ledger: Map<string, LedgerRow>;
  orders: Map<string, OrderRow>;
  tokens: Map<string, TokenRow>;
  failClaim: boolean;
}

function matchesCondition(row: LedgerRow, cond: LedgerCondition): boolean {
  if (row.status !== cond.status) {
    return false;
  }
  if (!('claimedAt' in cond)) {
    return true;
  }
  return row.claimedAt !== null && row.claimedAt.getTime() < cond.claimedAt.lt.getTime();
}

function createFakePrisma(db: FakeDb): EbookWebhookDeps['prisma'] {
  const ebookWebhookEvent = {
    async create(args: { data: Omit<LedgerRow, 'errorMessage' | 'processedAt'> }) {
      if (db.failClaim) {
        throw new Error('conexao recusada');
      }
      if (db.ledger.has(args.data.eventId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: LedgerRow = { ...args.data, errorMessage: null, processedAt: null };
      db.ledger.set(row.eventId, row);
      return row;
    },
    async findUnique(args: { where: { eventId: string } }) {
      return db.ledger.get(args.where.eventId) ?? null;
    },
    async update(args: { where: { eventId: string }; data: Partial<LedgerRow> }) {
      const row = db.ledger.get(args.where.eventId);
      if (!row) {
        throw new Error('registro ausente no ledger fake');
      }
      Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: {
      where: { eventId: string; OR: LedgerCondition[] };
      data: { status: LedgerStatus; claimedAt: Date; attempts: { increment: number } };
    }) {
      const row = db.ledger.get(args.where.eventId);
      if (!row || !args.where.OR.some((cond) => matchesCondition(row, cond))) {
        return { count: 0 };
      }
      row.status = args.data.status;
      row.claimedAt = args.data.claimedAt;
      row.attempts += args.data.attempts.increment;
      return { count: 1 };
    },
  };

  const ebookOrder = {
    async findUnique(args: { where: { stripePaymentIntentId: string } }) {
      const order = [...db.orders.values()].find(
        (row) => row.stripePaymentIntentId === args.where.stripePaymentIntentId,
      );
      return order ? { id: order.id, disputeId: order.disputeId } : null;
    },
    async updateMany(args: {
      where: { id: string; refundedAmount: { lt: number } };
      data: Partial<OrderRow>;
    }) {
      const order = db.orders.get(args.where.id);
      if (!order || order.refundedAmount >= args.where.refundedAmount.lt) {
        return { count: 0 };
      }
      Object.assign(order, args.data);
      return { count: 1 };
    },
    async update(args: { where: { id: string }; data: Partial<OrderRow> }) {
      const order = db.orders.get(args.where.id);
      if (!order) {
        throw new Error('pedido ausente no fake');
      }
      Object.assign(order, args.data);
      return order;
    },
  };

  const ebookAccessToken = {
    async updateMany(args: {
      where: { orderId: string; revokedAt: null };
      data: { revokedAt: Date; revokedReason: string };
    }) {
      let count = 0;
      for (const token of db.tokens.values()) {
        if (token.orderId === args.where.orderId && token.revokedAt === null) {
          Object.assign(token, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };

  const fake = {
    ebookWebhookEvent,
    ebookOrder,
    ebookAccessToken,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(fake);
    },
  };
  return fake as unknown as EbookWebhookDeps['prisma'];
}

interface Harness {
  deps: EbookWebhookDeps;
  db: FakeDb;
  pending: Array<() => Promise<void>>;
  ports: { [K in keyof EbookWebhookPorts]: ReturnType<typeof vi.fn> };
  retrieve: ReturnType<typeof vi.fn>;
  runPending(): Promise<void>;
}

function createHarness(options: { ports?: EbookWebhookPorts; piKind?: string } = {}): Harness {
  const db: FakeDb = { ledger: new Map(), orders: new Map(), tokens: new Map(), failClaim: false };
  const pending: Array<() => Promise<void>> = [];
  const ports = {
    fulfillCheckoutSession: vi.fn(async () => {}),
    notifyAsyncPaymentFailed: vi.fn(async () => {}),
    notifyRefund: vi.fn(async () => {}),
    notifyDispute: vi.fn(async () => {}),
  };
  const retrieve = vi.fn(async (id: string) => ({
    id,
    metadata: options.piKind === undefined ? {} : { kind: options.piKind },
  }));

  const deps: EbookWebhookDeps = {
    prisma: createFakePrisma(db),
    stripe: {
      webhooks: stripeSdk.webhooks,
      paymentIntents: { retrieve } as unknown as EbookWebhookDeps['stripe']['paymentIntents'],
    },
    secret: TEST_SECRET,
    ports: options.ports ?? ports,
    schedule: (task) => {
      pending.push(task);
    },
    now: () => NOW,
    config: { revokeOnRefund: true, revokeOnDispute: true },
  };

  return {
    deps,
    db,
    pending,
    ports,
    retrieve,
    async runPending() {
      while (pending.length > 0) {
        const task = pending.shift();
        if (task) {
          await task();
        }
      }
    },
  };
}

function seedOrder(db: FakeDb, input: { id: string; pi: string; refundedAmount?: number }): void {
  db.orders.set(input.id, {
    id: input.id,
    stripePaymentIntentId: input.pi,
    paymentStatus: 'PAID',
    refundedAmount: input.refundedAmount ?? 0,
    refundedAt: null,
    disputeId: null,
    disputeStatus: null,
    disputedAt: null,
  });
  db.tokens.set(`tok_${input.id}`, {
    id: `tok_${input.id}`,
    orderId: input.id,
    revokedAt: null,
    revokedReason: null,
  });
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

function sessionObject(sessionId: string, kind = 'ebook'): Record<string, unknown> {
  return {
    id: sessionId,
    object: 'checkout.session',
    metadata: { kind, ebook_slug: 'ebook-teste' },
    payment_status: 'paid',
  };
}

function chargeObject(pi: string, amountRefunded: number, refunded: boolean): Record<string, unknown> {
  return {
    id: 'ch_teste',
    object: 'charge',
    payment_intent: pi,
    amount_refunded: amountRefunded,
    refunded,
  };
}

function disputeObject(pi: string, disputeId: string): Record<string, unknown> {
  return { id: disputeId, object: 'dispute', payment_intent: pi, status: 'needs_response' };
}

function signed(payload: string, secret = TEST_SECRET) {
  return {
    rawBody: Buffer.from(payload),
    signature: stripeSdk.webhooks.generateTestHeaderString({ payload, secret }),
    contentLength: String(Buffer.byteLength(payload)),
  };
}

const ACCEPTED = { status: 200, body: { received: true, status: 'accepted' } };
const IGNORED = { status: 200, body: { received: true, status: 'ignored' } };
const DUPLICATE = { status: 200, body: { received: true, status: 'duplicate' } };
const PROCESSING_FAILED = { status: 500, body: { error: 'processing_failed' } };

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleEbookWebhookRequest: respostas antes do claim (D-B5)', () => {
  it('content-length acima do limite devolve 413 sem tocar o ledger', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_413', 'customer.created', { id: 'cus_1' });

    const result = await handleEbookWebhookRequest(
      { ...signed(payload), contentLength: String(EBOOK_WEBHOOK_MAX_BODY_BYTES + 1) },
      h.deps,
    );

    expect(result).toEqual({ status: 413, body: { error: 'payload_too_large' } });
    expect(h.db.ledger.size).toBe(0);
  });

  it('corpo acima do limite sem content-length devolve 413', async () => {
    const h = createHarness();

    const result = await handleEbookWebhookRequest(
      {
        rawBody: Buffer.alloc(EBOOK_WEBHOOK_MAX_BODY_BYTES + 1),
        signature: 't=1,v1=abc',
        contentLength: null,
      },
      h.deps,
    );

    expect(result).toEqual({ status: 413, body: { error: 'payload_too_large' } });
    expect(h.db.ledger.size).toBe(0);
  });

  it('sem segredo configurado devolve 503 e loga a ausencia', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_503', 'customer.created', { id: 'cus_1' });

    const result = await handleEbookWebhookRequest(signed(payload), {
      ...h.deps,
      secret: undefined,
    });

    expect(result).toEqual({ status: 503, body: { error: 'webhook_not_configured' } });
    expect(errorSpy).toHaveBeenCalledWith('[ebooks-webhook] STRIPE_EBOOKS_WEBHOOK_SECRET ausente');
    expect(h.db.ledger.size).toBe(0);
  });

  it('sem header stripe-signature devolve 400', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_400', 'customer.created', { id: 'cus_1' });

    const result = await handleEbookWebhookRequest(
      { ...signed(payload), signature: null },
      h.deps,
    );

    expect(result).toEqual({ status: 400, body: { error: 'missing_signature' } });
    expect(h.db.ledger.size).toBe(0);
  });

  it('assinatura de outro segredo devolve 400 Invalid signature.', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_outro', 'customer.created', { id: 'cus_1' });

    const result = await handleEbookWebhookRequest(
      signed(payload, 'whsec_outro_placeholder'),
      h.deps,
    );

    expect(result).toEqual({ status: 400, body: { error: 'Invalid signature.' } });
    expect(h.db.ledger.size).toBe(0);
  });

  it('claim que lanca devolve 500 processing_failed', async () => {
    const h = createHarness();
    h.db.failClaim = true;
    const payload = eventPayload('evt_claim', 'checkout.session.completed', sessionObject('cs_1'));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(PROCESSING_FAILED);
    expect(h.pending).toHaveLength(0);
  });
});

describe('handleEbookWebhookRequest: ledger (D-B5/D-B6)', () => {
  it('evento ja PROCESSED devolve duplicate sem agendar', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_dup', 'checkout.session.completed', sessionObject('cs_dup'));

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);
    await h.runPending();
    expect(h.db.ledger.get('evt_dup')?.status).toBe('PROCESSED');

    const second = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(second).toEqual(DUPLICATE);
    expect(h.pending).toHaveLength(0);
    expect(h.ports.fulfillCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('evento com claim recente devolve 503 in_progress', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_lease', 'checkout.session.completed', sessionObject('cs_l'));

    await handleEbookWebhookRequest(signed(payload), h.deps);
    const second = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(second).toEqual({ status: 503, body: { status: 'in_progress' } });
    expect(h.pending).toHaveLength(1);
  });

  it('tipo fora da lista devolve 200 ignored com motivo unsupported_event', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_cus', 'customer.created', { id: 'cus_1' });

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(IGNORED);
    expect(h.db.ledger.get('evt_cus')).toMatchObject({
      status: 'IGNORED',
      errorMessage: 'ignored:unsupported_event',
      checkoutSessionId: null,
    });
    expect(h.pending).toHaveLength(0);
  });

  it('sessao concluida que nao e de ebook devolve ignored not_ebook', async () => {
    const h = createHarness();
    const payload = eventPayload(
      'evt_credits',
      'checkout.session.completed',
      sessionObject('cs_credits', 'credits'),
    );

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(IGNORED);
    expect(h.db.ledger.get('evt_credits')).toMatchObject({
      status: 'IGNORED',
      errorMessage: 'ignored:not_ebook',
    });
  });
});

describe('handleEbookWebhookRequest: trabalho agendado (D-B7)', () => {
  it('checkout concluido agenda 1 tarefa e so chama o port quando ela roda', async () => {
    const h = createHarness();
    const payload = eventPayload('evt_ful', 'checkout.session.completed', sessionObject('cs_ful'));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(ACCEPTED);
    expect(h.pending).toHaveLength(1);
    expect(h.ports.fulfillCheckoutSession).not.toHaveBeenCalled();
    expect(h.db.ledger.get('evt_ful')).toMatchObject({
      status: 'PROCESSING',
      checkoutSessionId: 'cs_ful',
      attempts: 1,
    });

    await h.runPending();

    expect(h.ports.fulfillCheckoutSession).toHaveBeenCalledWith({
      checkoutSessionId: 'cs_ful',
      eventId: 'evt_ful',
      eventType: 'checkout.session.completed',
    });
    expect(h.db.ledger.get('evt_ful')).toMatchObject({
      status: 'PROCESSED',
      processedAt: NOW,
      errorMessage: null,
    });
  });

  it('async_payment_failed agenda notifyAsyncPaymentFailed', async () => {
    const h = createHarness();
    const payload = eventPayload(
      'evt_async',
      'checkout.session.async_payment_failed',
      sessionObject('cs_async'),
    );

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);
    expect(h.pending).toHaveLength(1);
    await h.runPending();

    expect(h.ports.notifyAsyncPaymentFailed).toHaveBeenCalledWith({
      checkoutSessionId: 'cs_async',
      eventId: 'evt_async',
    });
    expect(h.db.ledger.get('evt_async')?.status).toBe('PROCESSED');
  });

  it('port pendente do item 006 marca FAILED com o codigo do erro', async () => {
    const h = createHarness({ ports: pendingEbookWebhookPorts });
    const payload = eventPayload('evt_pend', 'checkout.session.completed', sessionObject('cs_pend'));

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);
    await expect(h.runPending()).resolves.toBeUndefined();

    const row = h.db.ledger.get('evt_pend');
    expect(row?.status).toBe('FAILED');
    expect(row?.errorMessage).toContain('EBOOK_WEBHOOK_PORT_NOT_READY');
    expect(row?.errorMessage).toContain('item-006');
  });

  it('erro do port com email e segredo grava mensagem sanitizada', async () => {
    const h = createHarness();
    h.ports.fulfillCheckoutSession.mockRejectedValueOnce(
      new Error('falha ao enviar para comprador@example.test com whsec_abc123'),
    );
    const payload = eventPayload('evt_san', 'checkout.session.completed', sessionObject('cs_san'));

    await handleEbookWebhookRequest(signed(payload), h.deps);
    await h.runPending();

    const message = h.db.ledger.get('evt_san')?.errorMessage ?? '';
    expect(h.db.ledger.get('evt_san')?.status).toBe('FAILED');
    expect(message).toContain('[email]');
    expect(message).toContain('whsec_***');
    expect(message).not.toContain('comprador@example.test');
    expect(message).not.toContain('whsec_abc123');
  });

  it('evento FAILED reentregue e reclamado e processado', async () => {
    const h = createHarness();
    h.ports.fulfillCheckoutSession.mockRejectedValueOnce(new Error('falha transitoria'));
    const payload = eventPayload('evt_re', 'checkout.session.completed', sessionObject('cs_re'));

    await handleEbookWebhookRequest(signed(payload), h.deps);
    await h.runPending();
    expect(h.db.ledger.get('evt_re')?.status).toBe('FAILED');

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);
    await h.runPending();

    expect(h.db.ledger.get('evt_re')).toMatchObject({
      status: 'PROCESSED',
      attempts: 2,
      errorMessage: null,
    });
  });
});

describe('handleEbookWebhookRequest: reembolso e disputa (D-B9)', () => {
  it('reembolso total revoga o token e agenda notifyRefund', async () => {
    const h = createHarness();
    seedOrder(h.db, { id: 'ord_total', pi: 'pi_total' });
    const payload = eventPayload('evt_rt', 'charge.refunded', chargeObject('pi_total', 1500, true));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(ACCEPTED);
    expect(h.db.orders.get('ord_total')).toMatchObject({
      paymentStatus: 'REFUNDED',
      refundedAmount: 1500,
      refundedAt: NOW,
    });
    expect(h.db.tokens.get('tok_ord_total')).toMatchObject({
      revokedAt: NOW,
      revokedReason: 'refund',
    });
    expect(h.pending).toHaveLength(1);

    await h.runPending();

    expect(h.ports.notifyRefund).toHaveBeenCalledTimes(1);
    expect(h.ports.notifyRefund).toHaveBeenCalledWith({
      orderId: 'ord_total',
      eventId: 'evt_rt',
      full: true,
    });
    expect(h.db.ledger.get('evt_rt')?.status).toBe('PROCESSED');
  });

  it('reembolso parcial nao revoga o token', async () => {
    const h = createHarness();
    seedOrder(h.db, { id: 'ord_parc', pi: 'pi_parc' });
    const payload = eventPayload('evt_rp', 'charge.refunded', chargeObject('pi_parc', 500, false));

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);

    expect(h.db.orders.get('ord_parc')).toMatchObject({
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundedAmount: 500,
    });
    expect(h.db.tokens.get('tok_ord_parc')?.revokedAt).toBeNull();
    await h.runPending();
    expect(h.ports.notifyRefund).toHaveBeenCalledWith({
      orderId: 'ord_parc',
      eventId: 'evt_rp',
      full: false,
    });
  });

  it('reembolso menor repetido nao regride e marca PROCESSED sem agendar', async () => {
    const h = createHarness();
    seedOrder(h.db, { id: 'ord_rep', pi: 'pi_rep', refundedAmount: 1000 });
    const payload = eventPayload('evt_menor', 'charge.refunded', chargeObject('pi_rep', 500, false));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(ACCEPTED);
    expect(h.db.orders.get('ord_rep')?.refundedAmount).toBe(1000);
    expect(h.db.ledger.get('evt_menor')).toMatchObject({ status: 'PROCESSED', processedAt: NOW });
    expect(h.pending).toHaveLength(0);
    expect(h.ports.notifyRefund).not.toHaveBeenCalled();
  });

  it('disputa revoga o token e agenda exatamente 1 notifyDispute', async () => {
    const h = createHarness();
    seedOrder(h.db, { id: 'ord_disp', pi: 'pi_disp' });
    const payload = eventPayload(
      'evt_disp',
      'charge.dispute.created',
      disputeObject('pi_disp', 'dp_1'),
    );

    expect(await handleEbookWebhookRequest(signed(payload), h.deps)).toEqual(ACCEPTED);

    expect(h.db.orders.get('ord_disp')).toMatchObject({
      paymentStatus: 'DISPUTED',
      disputeId: 'dp_1',
      disputeStatus: 'needs_response',
      disputedAt: NOW,
    });
    expect(h.db.tokens.get('tok_ord_disp')).toMatchObject({
      revokedAt: NOW,
      revokedReason: 'dispute',
    });
    expect(h.pending).toHaveLength(1);
    await h.runPending();
    expect(h.ports.notifyDispute).toHaveBeenCalledTimes(1);
    expect(h.ports.notifyDispute).toHaveBeenCalledWith({ orderId: 'ord_disp', eventId: 'evt_disp' });
  });

  it('disputa repetida com o mesmo id e idempotente', async () => {
    const h = createHarness();
    seedOrder(h.db, { id: 'ord_dd', pi: 'pi_dd' });
    const first = eventPayload('evt_dd1', 'charge.dispute.created', disputeObject('pi_dd', 'dp_9'));
    const again = eventPayload('evt_dd2', 'charge.dispute.created', disputeObject('pi_dd', 'dp_9'));

    await handleEbookWebhookRequest(signed(first), h.deps);
    await h.runPending();
    const result = await handleEbookWebhookRequest(signed(again), h.deps);

    expect(result).toEqual(ACCEPTED);
    expect(h.db.ledger.get('evt_dd2')?.status).toBe('PROCESSED');
    expect(h.pending).toHaveLength(0);
    expect(h.ports.notifyDispute).toHaveBeenCalledTimes(1);
  });

  it('pagamento de ebook sem pedido devolve 500 e marca FAILED', async () => {
    const h = createHarness({ piKind: 'ebook' });
    const payload = eventPayload('evt_cedo', 'charge.refunded', chargeObject('pi_cedo', 1500, true));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(PROCESSING_FAILED);
    expect(h.retrieve).toHaveBeenCalledWith('pi_cedo');
    expect(h.db.ledger.get('evt_cedo')?.status).toBe('FAILED');
    expect(h.db.ledger.get('evt_cedo')?.errorMessage).toContain('EBOOK_WEBHOOK_ORDER_PENDING');
    expect(h.pending).toHaveLength(0);
  });

  it('pagamento que nao e de ebook devolve 200 ignored not_ebook', async () => {
    const h = createHarness({ piKind: 'credits' });
    const payload = eventPayload('evt_outro_pi', 'charge.refunded', chargeObject('pi_x', 1500, true));

    const result = await handleEbookWebhookRequest(signed(payload), h.deps);

    expect(result).toEqual(IGNORED);
    expect(h.db.ledger.get('evt_outro_pi')).toMatchObject({
      status: 'IGNORED',
      errorMessage: 'ignored:not_ebook',
    });
    expect(h.pending).toHaveLength(0);
  });
});

describe('handleEbookWebhookRequest: logs (D-B17)', () => {
  it('nenhum log contem corpo, header de assinatura ou segredo', async () => {
    const h = createHarness({ ports: pendingEbookWebhookPorts });
    const payload = eventPayload('evt_log', 'checkout.session.completed', sessionObject('cs_log'));
    const input = signed(payload);

    await handleEbookWebhookRequest(input, h.deps);
    await h.runPending();
    await handleEbookWebhookRequest({ ...input, signature: `${input.signature},t=1` }, h.deps);

    const logged = JSON.stringify([
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]);
    expect(infoSpy.mock.calls.length + errorSpy.mock.calls.length).toBeGreaterThan(0);
    expect(logged).not.toContain(input.signature ?? '');
    expect(logged).not.toContain(TEST_SECRET);
    expect(logged).not.toContain('ebook-teste');
    expect(logged).not.toContain(payload);
  });
});
