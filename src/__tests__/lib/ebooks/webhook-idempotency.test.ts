// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { EBOOK_WEBHOOK_LEASE_MS } from '@/lib/ebooks/webhook-config';
import {
  claimEbookWebhookEvent,
  markEbookWebhookFailed,
  markEbookWebhookIgnored,
  markEbookWebhookProcessed,
  type EbookWebhookLedgerDeps,
} from '@/lib/ebooks/webhook-idempotency';

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

interface CreateData {
  eventId: string;
  type: string;
  checkoutSessionId: string | null;
  status: LedgerStatus;
  claimedAt: Date;
  attempts: number;
}

type WhereCondition =
  | { status: LedgerStatus }
  | { status: LedgerStatus; claimedAt: { lt: Date } };

interface UpdateManyArgs {
  where: { eventId: string; OR: WhereCondition[] };
  data: { status: LedgerStatus; claimedAt: Date; attempts: { increment: number } };
}

interface UpdateArgs {
  where: { eventId: string };
  data: Partial<
    Pick<LedgerRow, 'status' | 'claimedAt' | 'attempts' | 'errorMessage' | 'processedAt'>
  >;
}

/** Espelha o where do contrato: FAILED ou PROCESSING com claimedAt < cutoff. */
function matchesWhereCondition(row: LedgerRow, cond: WhereCondition): boolean {
  if (row.status !== cond.status) {
    return false;
  }
  if (!('claimedAt' in cond)) {
    return true;
  }
  // Mesmo efeito do `lt` do Prisma: claimedAt null nunca casa.
  return row.claimedAt !== null && row.claimedAt.getTime() < cond.claimedAt.lt.getTime();
}

interface FakeLedger {
  deps: EbookWebhookLedgerDeps;
  seed(input: Partial<LedgerRow> & { eventId: string }): LedgerRow;
  get(eventId: string): LedgerRow | undefined;
}

function createFakeLedger(now: Date): FakeLedger {
  const rows = new Map<string, LedgerRow>();

  function seed(input: Partial<LedgerRow> & { eventId: string }): LedgerRow {
    const row: LedgerRow = {
      eventId: input.eventId,
      type: input.type ?? 'checkout.session.completed',
      checkoutSessionId: input.checkoutSessionId ?? null,
      status: input.status ?? 'RECEIVED',
      claimedAt: input.claimedAt ?? null,
      attempts: input.attempts ?? 0,
      errorMessage: input.errorMessage ?? null,
      processedAt: input.processedAt ?? null,
    };
    rows.set(row.eventId, row);
    return row;
  }

  const delegate = {
    async create(args: { data: CreateData }): Promise<LedgerRow> {
      if (rows.has(args.data.eventId)) {
        // Instancia real do Prisma: o claim trata P2002 por instanceof.
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      return seed({ ...args.data });
    },
    async findUnique(args: { where: { eventId: string } }): Promise<LedgerRow | null> {
      return rows.get(args.where.eventId) ?? null;
    },
    async update(args: UpdateArgs): Promise<LedgerRow> {
      const row = rows.get(args.where.eventId);
      if (!row) {
        throw new Error('registro ausente no ledger fake');
      }
      Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: UpdateManyArgs): Promise<{ count: number }> {
      const matched = [...rows.values()].filter(
        (row) =>
          row.eventId === args.where.eventId &&
          args.where.OR.some((cond) => matchesWhereCondition(row, cond)),
      );
      for (const row of matched) {
        row.status = args.data.status;
        row.claimedAt = args.data.claimedAt;
        row.attempts += args.data.attempts.increment;
      }
      return { count: matched.length };
    },
  };

  return {
    deps: {
      prisma: { ebookWebhookEvent: delegate } as unknown as EbookWebhookLedgerDeps['prisma'],
      now: () => now,
    },
    seed,
    get: (eventId: string) => rows.get(eventId),
  };
}

const NOW = new Date('2026-10-19T12:00:00.000Z');
const TYPE = 'checkout.session.completed';

describe('claimEbookWebhookEvent', () => {
  it('primeiro claim grava PROCESSING e devolve claimed', async () => {
    const ledger = createFakeLedger(NOW);

    const result = await claimEbookWebhookEvent(
      { eventId: 'evt_novo', type: TYPE, checkoutSessionId: 'cs_novo' },
      ledger.deps,
    );

    expect(result).toBe('claimed');
    expect(ledger.get('evt_novo')).toEqual({
      eventId: 'evt_novo',
      type: TYPE,
      checkoutSessionId: 'cs_novo',
      status: 'PROCESSING',
      claimedAt: NOW,
      attempts: 1,
      errorMessage: null,
      processedAt: null,
    });

    await claimEbookWebhookEvent(
      { eventId: 'evt_sem_sessao', type: 'charge.refunded' },
      ledger.deps,
    );
    expect(ledger.get('evt_sem_sessao')?.checkoutSessionId).toBeNull();
  });

  it('evento PROCESSED devolve duplicate sem novo claim', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_proc',
      status: 'PROCESSED',
      claimedAt: NOW,
      attempts: 1,
      processedAt: NOW,
    });

    const result = await claimEbookWebhookEvent({ eventId: 'evt_proc', type: TYPE }, ledger.deps);

    expect(result).toBe('duplicate');
    expect(ledger.get('evt_proc')?.status).toBe('PROCESSED');
    expect(ledger.get('evt_proc')?.attempts).toBe(1);
  });

  it('evento IGNORED devolve duplicate', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_ign',
      status: 'IGNORED',
      claimedAt: NOW,
      attempts: 1,
      processedAt: NOW,
    });

    const result = await claimEbookWebhookEvent({ eventId: 'evt_ign', type: TYPE }, ledger.deps);

    expect(result).toBe('duplicate');
  });

  it('PROCESSING dentro do lease devolve in_progress', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_lease',
      status: 'PROCESSING',
      claimedAt: new Date(NOW.getTime() - (EBOOK_WEBHOOK_LEASE_MS - 30_000)),
      attempts: 1,
    });

    const result = await claimEbookWebhookEvent({ eventId: 'evt_lease', type: TYPE }, ledger.deps);

    expect(result).toBe('in_progress');
    expect(ledger.get('evt_lease')?.attempts).toBe(1);
  });

  it('reclaim de FAILED incrementa attempts', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_failed',
      status: 'FAILED',
      claimedAt: new Date(NOW.getTime() - EBOOK_WEBHOOK_LEASE_MS * 2),
      attempts: 2,
      errorMessage: 'falha anterior',
    });

    const result = await claimEbookWebhookEvent(
      { eventId: 'evt_failed', type: TYPE },
      ledger.deps,
    );

    expect(result).toBe('claimed');
    expect(ledger.get('evt_failed')).toMatchObject({
      status: 'PROCESSING',
      claimedAt: NOW,
      attempts: 3,
    });
  });

  it('reclaim de PROCESSING vencido incrementa attempts', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_vencido',
      status: 'PROCESSING',
      claimedAt: new Date(NOW.getTime() - EBOOK_WEBHOOK_LEASE_MS - 1),
      attempts: 1,
    });

    const result = await claimEbookWebhookEvent(
      { eventId: 'evt_vencido', type: TYPE },
      ledger.deps,
    );

    expect(result).toBe('claimed');
    expect(ledger.get('evt_vencido')).toMatchObject({
      status: 'PROCESSING',
      claimedAt: NOW,
      attempts: 2,
    });
  });

  it('claimedAt null vira in_progress no updateMany', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({ eventId: 'evt_null', status: 'PROCESSING', claimedAt: null, attempts: 1 });

    const result = await claimEbookWebhookEvent({ eventId: 'evt_null', type: TYPE }, ledger.deps);

    // PROCESSING com claimedAt null nao casa o `lt` do updateMany: vira
    // in_progress sem logica extra, ate a reentrega da Stripe.
    expect(result).toBe('in_progress');
    expect(ledger.get('evt_null')?.attempts).toBe(1);
  });
});

describe('markEbookWebhookProcessed', () => {
  it('grava PROCESSED e limpa errorMessage', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({
      eventId: 'evt_ok',
      status: 'PROCESSING',
      claimedAt: NOW,
      attempts: 1,
      errorMessage: 'ignored:not_ebook',
    });

    await markEbookWebhookProcessed({ eventId: 'evt_ok' }, ledger.deps);

    expect(ledger.get('evt_ok')).toMatchObject({
      status: 'PROCESSED',
      processedAt: NOW,
      errorMessage: null,
    });
  });
});

describe('markEbookWebhookIgnored', () => {
  it('grava IGNORED com ignored:not_ebook', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({ eventId: 'evt_skip', status: 'PROCESSING', claimedAt: NOW, attempts: 1 });

    await markEbookWebhookIgnored({ eventId: 'evt_skip', reason: 'not_ebook' }, ledger.deps);

    expect(ledger.get('evt_skip')).toMatchObject({
      status: 'IGNORED',
      processedAt: NOW,
      errorMessage: 'ignored:not_ebook',
    });
  });
});

describe('markEbookWebhookFailed', () => {
  it('sanitiza segredos e trunca a 500 chars', async () => {
    const ledger = createFakeLedger(NOW);
    ledger.seed({ eventId: 'evt_msg', status: 'PROCESSING', claimedAt: NOW, attempts: 1 });

    const email = 'buyer' + '@' + 'example.test';
    const webhookSecret = 'whsec_' + 'a'.repeat(20);
    const secretKey = 'sk_' + 'live_' + 'b'.repeat(20);
    const bearer = 'Bearer ' + 'c'.repeat(20);
    const raw =
      `falha para ${email} com ${webhookSecret}, ${secretKey} e ${bearer}  ` + 'x'.repeat(600);

    await markEbookWebhookFailed({ eventId: 'evt_msg', errorMessage: raw }, ledger.deps);

    const row = ledger.get('evt_msg');
    expect(row?.status).toBe('FAILED');
    const message = row?.errorMessage ?? '';
    expect(message).toHaveLength(500);
    expect(message).toContain('[email]');
    expect(message).toContain('whsec_***');
    expect(message).toContain('sk_***');
    expect(message).toContain('Bearer ***');
    expect(message).not.toContain(email);
    expect(message).not.toContain(webhookSecret);
    expect(message).not.toContain(secretKey);
    expect(message).not.toContain(bearer);
    expect(message).not.toContain('  ');
  });
});

describe('claimEbookWebhookEvent: erro de banco', () => {
  it('erro que nao e P2002 e relancado', async () => {
    const boom = new Error('banco indisponivel');
    const deps: EbookWebhookLedgerDeps = {
      prisma: {
        ebookWebhookEvent: {
          create: async () => {
            throw boom;
          },
        },
      } as unknown as EbookWebhookLedgerDeps['prisma'],
      now: () => NOW,
    };

    await expect(
      claimEbookWebhookEvent({ eventId: 'evt_erro', type: TYPE }, deps),
    ).rejects.toBe(boom);
  });
});
