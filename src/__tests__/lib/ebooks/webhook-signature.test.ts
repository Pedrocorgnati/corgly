// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { handleEbookWebhookRequest, type EbookWebhookDeps } from '@/lib/ebooks/webhook';

// Casos de D-B3: verificacao de assinatura com o SDK real (constructEvent e
// local, sem rede). Segredo e chave sao placeholders, nunca valores reais.

const TEST_SECRET = 'whsec_test_placeholder';
const stripeSdk = new Stripe('sk_test_placeholder');

interface LedgerRow {
  eventId: string;
  status: string;
}

function createDeps(): { deps: EbookWebhookDeps; rows: Map<string, LedgerRow> } {
  const rows = new Map<string, LedgerRow>();
  const ledger = {
    async create(args: { data: LedgerRow }): Promise<LedgerRow> {
      if (rows.has(args.data.eventId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row = { eventId: args.data.eventId, status: args.data.status };
      rows.set(row.eventId, row);
      return row;
    },
    async update(args: { where: { eventId: string }; data: { status: string } }): Promise<LedgerRow> {
      const row = rows.get(args.where.eventId);
      if (!row) {
        throw new Error('registro ausente no ledger fake');
      }
      row.status = args.data.status;
      return row;
    },
  };

  const deps: EbookWebhookDeps = {
    prisma: { ebookWebhookEvent: ledger } as unknown as EbookWebhookDeps['prisma'],
    stripe: {
      webhooks: stripeSdk.webhooks,
      paymentIntents: {
        retrieve: vi.fn(),
      } as unknown as EbookWebhookDeps['stripe']['paymentIntents'],
    },
    secret: TEST_SECRET,
    ports: {
      fulfillCheckoutSession: vi.fn(async () => {}),
      notifyAsyncPaymentFailed: vi.fn(async () => {}),
      notifyRefund: vi.fn(async () => {}),
      notifyDispute: vi.fn(async () => {}),
    },
    schedule: () => {},
    now: () => new Date('2026-10-19T12:00:00Z'),
    config: { revokeOnRefund: true, revokeOnDispute: true },
  };
  return { deps, rows };
}

/** Evento ignorado (tipo fora da lista): passa da assinatura sem tocar pedido. */
function payloadOf(eventId: string): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'customer.created',
    api_version: '2025-01-27.acacia',
    created: 1_760_875_200,
    livemode: false,
    data: { object: { id: 'cus_teste', object: 'customer' } },
  });
}

function request(payload: string, signature: string) {
  return {
    rawBody: Buffer.from(payload),
    signature,
    contentLength: String(Buffer.byteLength(payload)),
  };
}

describe('handleEbookWebhookRequest: assinatura (D-B3)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('corpo cru alterado depois de assinado devolve 400 sem tocar o ledger', async () => {
    const { deps, rows } = createDeps();
    const payload = payloadOf('evt_alterado');
    const signature = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });

    const result = await handleEbookWebhookRequest(
      request(payload.replace('cus_teste', 'cus_outro'), signature),
      deps,
    );

    expect(result).toEqual({ status: 400, body: { error: 'Invalid signature.' } });
    expect(rows.size).toBe(0);
  });

  it('replay fora da tolerancia de 300 s devolve 400', async () => {
    const { deps, rows } = createDeps();
    const payload = payloadOf('evt_replay');
    const signature = stripeSdk.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });

    const result = await handleEbookWebhookRequest(request(payload, signature), deps);

    expect(result).toEqual({ status: 400, body: { error: 'Invalid signature.' } });
    expect(rows.size).toBe(0);
  });

  it('header com dois t= devolve 400 sem chamar constructEvent', async () => {
    const { deps, rows } = createDeps();
    const constructEvent = vi.spyOn(deps.stripe.webhooks, 'constructEvent');
    const payload = payloadOf('evt_duplicado');
    const signature = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });

    const result = await handleEbookWebhookRequest(
      request(payload, `${signature},${signature}`),
      deps,
    );

    expect(result).toEqual({ status: 400, body: { error: 'invalid_signature_header' } });
    expect(constructEvent).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });

  it('assinatura valida segue ao claim e grava o ledger', async () => {
    const { deps, rows } = createDeps();
    const payload = payloadOf('evt_valido');
    const signature = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });

    const result = await handleEbookWebhookRequest(request(payload, signature), deps);

    expect(result).toEqual({ status: 200, body: { received: true, status: 'ignored' } });
    expect(rows.get('evt_valido')?.status).toBe('IGNORED');
  });
});
