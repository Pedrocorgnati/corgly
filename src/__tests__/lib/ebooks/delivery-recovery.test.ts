// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  fulfill: vi.fn(),
  reconcileStatus: vi.fn(),
  buildDeps: vi.fn(),
  getStripe: vi.fn(),
  sentinel: { marker: 'fulfillment-deps-sentinel' },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { ebookOrder: { findMany: mocks.findMany, findUnique: mocks.findUnique } },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.warn, error: mocks.error, info: mocks.info },
}));
vi.mock('@/lib/stripe', () => ({ getStripe: mocks.getStripe }));
vi.mock('@/lib/ebooks/fulfillment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ebooks/fulfillment')>()),
  fulfillEbookCheckoutSession: mocks.fulfill,
  reconcileEbookDeliveryStatus: mocks.reconcileStatus,
}));
vi.mock('@/lib/ebooks/fulfillment-ports', () => ({
  buildDefaultEbookFulfillmentDeps: mocks.buildDeps,
}));

import { AppError } from '@/lib/errors';
import { EBOOK_DELIVERY_LEASE_MS } from '@/lib/ebooks/fulfillment';
import {
  EBOOK_RECOVERY_BATCH_SIZE,
  EBOOK_RECOVERY_CIRCUIT_BREAKER_REVISION,
  classifyEbookRecoveryCandidate,
  hashManifest,
  listPaidEbookSessions,
  reconcileEbookDeliveries,
  recoverEbookDeliveries,
  runEbooksDeliveryRecoveryCli,
  serializeEbookRecoveryManifest,
  type EbookRecoveryEntry,
  type EbookRecoveryManifest,
  type EbookRecoveryOrderSnapshot,
  type EbookRecoveryPrisma,
  type EbookRecoverySession,
  type EbookRecoveryStripe,
} from '@/lib/ebooks/delivery-recovery';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const REV = EBOOK_RECOVERY_CIRCUIT_BREAKER_REVISION;

const prismaDep = {
  ebookOrder: { findMany: mocks.findMany, findUnique: mocks.findUnique },
} as unknown as EbookRecoveryPrisma;

// Estado "do banco" lido pelos mocks do prisma, por checkoutSessionId.
let orders: Map<string, EbookRecoveryOrderSnapshot>;
let tmpDir: string;

function csId(n: number): string {
  return `cs_test_fixture_${String(n).padStart(2, '0')}`;
}

function makeOrder(
  n: number,
  overrides: Partial<EbookRecoveryOrderSnapshot> = {},
): EbookRecoveryOrderSnapshot {
  return {
    id: `ord_fixture_${n}`,
    checkoutSessionId: csId(n),
    paymentStatus: 'PAID',
    deliveryStatus: 'PENDING',
    deliveryClaimedAt: null,
    ...overrides,
  };
}

function makeSession(n: number, overrides: Partial<EbookRecoverySession> = {}): EbookRecoverySession {
  return {
    id: csId(n),
    status: 'complete',
    payment_status: 'paid',
    metadata: { kind: 'ebook' },
    ...overrides,
  };
}

function makeStripe(pages: Array<{ data: EbookRecoverySession[]; has_more: boolean }>) {
  const list = vi.fn();
  pages.forEach((page) => list.mockResolvedValueOnce(page));
  const stripe: EbookRecoveryStripe = { checkout: { sessions: { list } } };
  return { stripe, list };
}

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (l: string) => out.push(l), stderr: (l: string) => err.push(l) },
    out,
    err,
  };
}

function loggedMessages(): string {
  return JSON.stringify([
    ...mocks.warn.mock.calls,
    ...mocks.error.mock.calls,
    ...mocks.info.mock.calls,
  ]);
}

function makeEntries(
  count: number,
  classification: EbookRecoveryEntry['classification'] = 'affected',
): EbookRecoveryEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    checkoutSessionId: csId(i + 1),
    orderId: null,
    classification,
    reason: null,
  }));
}

function writeManifest(entries: EbookRecoveryEntry[], revision = REV) {
  const manifest: EbookRecoveryManifest = {
    schemaVersion: 1,
    window: {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-10T00:00:00.000Z',
      timezone: 'America/Sao_Paulo',
    },
    generatedAt: NOW.toISOString(),
    circuitBreakerRevision: revision,
    entries,
  };
  const content = serializeEbookRecoveryManifest(manifest);
  const file = path.join(tmpDir, `manifest-${hashManifest(content).slice(0, 8)}.json`);
  fs.writeFileSync(file, content, 'utf8');
  return { file, content, sha256: hashManifest(content) };
}

function recoverInput(
  m: { file: string; sha256: string },
  allowlist: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    manifestPath: m.file,
    sha256: m.sha256,
    approveCount: allowlist.length,
    allowlist,
    circuitBreakerRevision: REV,
    execute: true,
    ...overrides,
  };
}

function expectNothingTouched(): void {
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.fulfill).not.toHaveBeenCalled();
  expect(mocks.reconcileStatus).not.toHaveBeenCalled();
  expect(mocks.buildDeps).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  orders = new Map();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebooks-recovery-test-'));
  mocks.findMany.mockImplementation(
    async (args: { where: { checkoutSessionId: { in: string[] } } }) =>
      args.where.checkoutSessionId.in.flatMap((id) => {
        const order = orders.get(id);
        return order ? [order] : [];
      }),
  );
  mocks.findUnique.mockImplementation(
    async (args: { where: { checkoutSessionId: string } }) =>
      orders.get(args.where.checkoutSessionId) ?? null,
  );
  mocks.fulfill.mockResolvedValue({ status: 'delivered', orderId: 'ord_x' });
  mocks.reconcileStatus.mockResolvedValue({ status: 'delivered', orderId: 'ord_x' });
  mocks.buildDeps.mockReturnValue(mocks.sentinel);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('delivery recovery: listagem das sessions', () => {
  it('pagina com starting_after, filtra paid/complete/ebook e conta scanned', async () => {
    const { stripe, list } = makeStripe([
      {
        data: [
          makeSession(1),
          makeSession(2, { payment_status: 'unpaid' }),
          makeSession(3, { status: 'expired' }),
        ],
        has_more: true,
      },
      {
        data: [makeSession(4, { metadata: { kind: 'outro' } }), makeSession(5, { metadata: null }), makeSession(6)],
        has_more: false,
      },
    ]);
    const result = await listPaidEbookSessions(stripe, {
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
    });
    expect(result.scanned).toBe(6);
    expect(result.sessions.map((s) => s.id)).toEqual([csId(1), csId(6)]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]?.[0]).toEqual({
      created: { gte: Date.UTC(2026, 9, 1) / 1000, lt: Date.UTC(2026, 9, 2) / 1000 },
      limit: 100,
    });
    expect(list.mock.calls[1]?.[0]).toMatchObject({ starting_after: csId(3) });
  });

  it('instante fracionario arredonda para cima e nao inclui o segundo anterior a from', async () => {
    const { stripe, list } = makeStripe([{ data: [], has_more: false }]);
    await listPaidEbookSessions(stripe, {
      from: new Date('2026-10-01T00:00:00.500Z'),
      to: new Date('2026-10-02T00:00:00.500Z'),
    });
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      created: { gte: Date.UTC(2026, 9, 1) / 1000 + 1, lt: Date.UTC(2026, 9, 2) / 1000 + 1 },
    });
  });

  it('pagina vazia com has_more true nao entra em loop', async () => {
    const { stripe, list } = makeStripe([{ data: [], has_more: true }]);
    const result = await listPaidEbookSessions(stripe, { from: NOW, to: new Date(NOW.getTime() + 1000) });
    expect(result).toEqual({ scanned: 0, sessions: [] });
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('delivery recovery: classificacao (tabela D4)', () => {
  const lease = EBOOK_DELIVERY_LEASE_MS;
  const cases: Array<
    [string, EbookRecoveryOrderSnapshot | null, { classification: string; reason: string | null }]
  > = [
    ['pedido inexistente', null, { classification: 'affected', reason: null }],
    ['PENDING', makeOrder(1), { classification: 'affected', reason: null }],
    [
      'CLAIMED sem timestamp',
      makeOrder(1, { deliveryStatus: 'CLAIMED' }),
      { classification: 'manual_review', reason: 'claimed_without_timestamp' },
    ],
    [
      'SENDING sem timestamp',
      makeOrder(1, { deliveryStatus: 'SENDING' }),
      { classification: 'manual_review', reason: 'claimed_without_timestamp' },
    ],
    [
      'CLAIMED com lease vencido exatamente agora',
      makeOrder(1, { deliveryStatus: 'CLAIMED', deliveryClaimedAt: new Date(NOW.getTime() - lease) }),
      { classification: 'affected', reason: null },
    ],
    [
      'SENDING com lease vencido',
      makeOrder(1, { deliveryStatus: 'SENDING', deliveryClaimedAt: new Date(NOW.getTime() - lease - 1) }),
      { classification: 'affected', reason: null },
    ],
    [
      'CLAIMED dentro do lease',
      makeOrder(1, { deliveryStatus: 'CLAIMED', deliveryClaimedAt: new Date(NOW.getTime() - lease + 1) }),
      { classification: 'excluded', reason: 'in_progress' },
    ],
    [
      'SENDING dentro do lease',
      makeOrder(1, { deliveryStatus: 'SENDING', deliveryClaimedAt: new Date(NOW.getTime() - 1000) }),
      { classification: 'excluded', reason: 'in_progress' },
    ],
    ['ACCEPTED', makeOrder(1, { deliveryStatus: 'ACCEPTED' }), { classification: 'reconcile_status', reason: null }],
    ['DELIVERED', makeOrder(1, { deliveryStatus: 'DELIVERED' }), { classification: 'excluded', reason: 'delivered' }],
    [
      'NEEDS_REVIEW',
      makeOrder(1, { deliveryStatus: 'NEEDS_REVIEW' }),
      { classification: 'manual_review', reason: 'needs_review' },
    ],
    [
      'REFUNDED mesmo com DELIVERED',
      makeOrder(1, { paymentStatus: 'REFUNDED', deliveryStatus: 'DELIVERED' }),
      { classification: 'excluded', reason: 'payment_REFUNDED' },
    ],
    ['DISPUTED', makeOrder(1, { paymentStatus: 'DISPUTED' }), { classification: 'excluded', reason: 'payment_DISPUTED' }],
    ['FAILED', makeOrder(1, { paymentStatus: 'FAILED' }), { classification: 'excluded', reason: 'payment_FAILED' }],
    ['PENDING pago', makeOrder(1, { paymentStatus: 'PENDING' }), { classification: 'excluded', reason: 'payment_PENDING' }],
    [
      'ASYNC_PENDING',
      makeOrder(1, { paymentStatus: 'ASYNC_PENDING' }),
      { classification: 'excluded', reason: 'payment_ASYNC_PENDING' },
    ],
    [
      'PARTIALLY_REFUNDED',
      makeOrder(1, { paymentStatus: 'PARTIALLY_REFUNDED' }),
      { classification: 'excluded', reason: 'payment_PARTIALLY_REFUNDED' },
    ],
  ];

  it.each(cases)('%s', (_label, order, expected) => {
    expect(classifyEbookRecoveryCandidate({ id: csId(1) }, order, NOW)).toEqual(expected);
  });
});

describe('delivery recovery: reconcile', () => {
  it('gera conteudo e sha identicos para a mesma entrada e o mesmo now, sem PII', async () => {
    orders.set(csId(2), makeOrder(2, { deliveryStatus: 'ACCEPTED' }));
    orders.set(csId(3), makeOrder(3, { deliveryStatus: 'DELIVERED' }));
    orders.set(csId(4), makeOrder(4, { paymentStatus: 'REFUNDED' }));
    const pages = () => [{ data: [makeSession(4), makeSession(3), makeSession(2), makeSession(1)], has_more: false }];
    const input = { from: '2026-10-01', to: '2026-10-10', timezone: 'America/Sao_Paulo' };

    const a = await reconcileEbookDeliveries(
      { ...input, out: path.join(tmpDir, 'a.json') },
      { stripe: makeStripe(pages()).stripe, prisma: prismaDep, now: () => NOW },
    );
    const b = await reconcileEbookDeliveries(
      { ...input, out: path.join(tmpDir, 'b.json') },
      { stripe: makeStripe(pages()).stripe, prisma: prismaDep, now: () => NOW },
    );
    const contentA = fs.readFileSync(a.path, 'utf8');
    expect(contentA).toBe(fs.readFileSync(b.path, 'utf8'));
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toBe(hashManifest(contentA));
    expect(a.counts).toEqual({ affected: 1, reconcile_status: 1, manual_review: 0, excluded: 2 });

    const parsed = JSON.parse(contentA) as EbookRecoveryManifest;
    expect(parsed.entries.map((e) => e.checkoutSessionId)).toEqual([csId(1), csId(2), csId(3), csId(4)]);
    for (const entry of parsed.entries) {
      expect(Object.keys(entry).sort()).toEqual(['checkoutSessionId', 'classification', 'orderId', 'reason']);
    }
    expect(parsed.entries.map((e) => e.reason)).toEqual([null, null, 'delivered', 'payment_REFUNDED']);
    expect(parsed.circuitBreakerRevision).toBe(REV);
    expect(parsed.generatedAt).toBe(NOW.toISOString());
    expect(contentA.endsWith('\n')).toBe(true);
    expect(contentA).not.toMatch(/@|email|customer/i);
  });

  it('aceita datetime com offset ou Z e resolve o mesmo instante UTC em qualquer fuso', async () => {
    const { stripe, list } = makeStripe([{ data: [], has_more: false }]);
    await reconcileEbookDeliveries(
      {
        from: '2026-09-30T21:00:00-03:00',
        to: '2026-10-02T00:00:00.000Z',
        timezone: 'America/Sao_Paulo',
        out: path.join(tmpDir, 'offset.json'),
      },
      { stripe, prisma: prismaDep, now: () => NOW },
    );
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      created: { gte: Date.UTC(2026, 9, 1) / 1000, lt: Date.UTC(2026, 9, 2) / 1000 },
    });
  });

  it('deduplica sessions repetidas e nao consulta o banco quando nao ha sessions', async () => {
    const dup = await reconcileEbookDeliveries(
      { from: '2026-10-01', to: '2026-10-02', timezone: 'UTC', out: path.join(tmpDir, 'dup.json') },
      { stripe: makeStripe([{ data: [makeSession(1), makeSession(1)], has_more: false }]).stripe, prisma: prismaDep, now: () => NOW },
    );
    expect(dup.counts.affected).toBe(1);

    mocks.findMany.mockClear();
    await reconcileEbookDeliveries(
      { from: '2026-10-01', to: '2026-10-02', timezone: 'UTC', out: path.join(tmpDir, 'vazio.json') },
      { stripe: makeStripe([{ data: [], has_more: false }]).stripe, prisma: prismaDep, now: () => NOW },
    );
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('recusa destino dentro de um repositorio git antes de gravar', async () => {
    const inside = path.join(process.cwd(), 'ebooks-recovery-test-nunca-gravar.json');
    await expect(
      reconcileEbookDeliveries(
        { from: '2026-10-01', to: '2026-10-02', timezone: 'UTC', out: inside },
        { stripe: makeStripe([{ data: [], has_more: false }]).stripe, prisma: prismaDep, now: () => NOW },
      ),
    ).rejects.toMatchObject({ code: 'EBOOK_RECOVERY_OUTPUT_REJECTED' });
    expect(fs.existsSync(inside)).toBe(false);
  });

  it('nunca sobrescreve um arquivo existente', async () => {
    const target = path.join(tmpDir, 'existe.json');
    fs.writeFileSync(target, 'intacto', 'utf8');
    await expect(
      reconcileEbookDeliveries(
        { from: '2026-10-01', to: '2026-10-02', timezone: 'UTC', out: target },
        { stripe: makeStripe([{ data: [], has_more: false }]).stripe, prisma: prismaDep, now: () => NOW },
      ),
    ).rejects.toMatchObject({ code: 'EBOOK_RECOVERY_OUTPUT_REJECTED' });
    expect(fs.readFileSync(target, 'utf8')).toBe('intacto');
  });

  it.each([
    ['from igual a to', { from: '2026-10-01', to: '2026-10-01', timezone: 'UTC' }],
    ['from depois de to', { from: '2026-10-05', to: '2026-10-01', timezone: 'UTC' }],
    ['janela acima de 90 dias', { from: '2026-01-01', to: '2026-06-01', timezone: 'UTC' }],
    ['timezone invalida', { from: '2026-10-01', to: '2026-10-02', timezone: 'Marte/Olympus' }],
    ['data invalida', { from: 'nao-e-data', to: '2026-10-02', timezone: 'UTC' }],
    ['datetime sem Z nem offset', { from: '2026-10-01T00:00:00', to: '2026-10-02', timezone: 'UTC' }],
    ['formato nao ISO', { from: 'Oct 1 2026', to: '2026-10-02', timezone: 'UTC' }],
    ['dia inexistente', { from: '2026-02-30', to: '2026-03-05', timezone: 'UTC' }],
  ])('rejeita %s sem chamar o Stripe', async (_label, input) => {
    const { stripe, list } = makeStripe([]);
    await expect(
      reconcileEbookDeliveries(input, { stripe, prisma: prismaDep, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'EBOOK_RECOVERY_INVALID_INPUT' });
    expect(list).not.toHaveBeenCalled();
  });
});

describe('delivery recovery: recover aborta antes do primeiro adapter', () => {
  it('sem --execute so devolve o plano e nao toca banco nem fulfillment', async () => {
    const entries = [...makeEntries(2), { ...makeEntries(3)[2]!, classification: 'reconcile_status' as const }];
    const m = writeManifest(entries);
    const result = await recoverEbookDeliveries(
      recoverInput(m, [csId(1), csId(3)], { execute: false }),
      { prisma: prismaDep },
    );
    expect(result.mode).toBe('plan');
    expect(result.plan).toEqual([
      { checkoutSessionId: csId(1), action: 'fulfill' },
      { checkoutSessionId: csId(3), action: 'reconcile_status' },
    ]);
    expect(result.results).toEqual([]);
    expectNothingTouched();
  });

  it.each([
    ['sha divergente', 'EBOOK_RECOVERY_SHA_MISMATCH'],
    ['manifesto malformado', 'EBOOK_RECOVERY_MANIFEST_INVALID'],
    ['manifesto nao canonico', 'EBOOK_RECOVERY_MANIFEST_NOT_CANONICAL'],
    ['approve-count 0', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['approve-count 26', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['approve-count nao inteiro', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['allowlist de tamanho errado', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['id repetido na allowlist', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['id fora do manifesto', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['id excluded', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['id manual_review', 'EBOOK_RECOVERY_APPROVAL_INVALID'],
    ['revisao divergente da CLI', 'EBOOK_RECOVERY_REVISION_MISMATCH'],
    ['revisao divergente do manifesto', 'EBOOK_RECOVERY_REVISION_MISMATCH'],
  ])('%s', async (label, code) => {
    const entries: EbookRecoveryEntry[] = [
      ...makeEntries(3),
      { checkoutSessionId: csId(4), orderId: 'ord_fixture_4', classification: 'excluded', reason: 'delivered' },
      { checkoutSessionId: csId(5), orderId: 'ord_fixture_5', classification: 'manual_review', reason: 'needs_review' },
    ];
    let m = writeManifest(entries);
    let input = recoverInput(m, [csId(1), csId(2)]);

    switch (label) {
      case 'sha divergente':
        input = { ...input, sha256: '0'.repeat(64) };
        break;
      case 'manifesto malformado': {
        const bad = '{ nao e json';
        const file = path.join(tmpDir, 'ruim.json');
        fs.writeFileSync(file, bad, 'utf8');
        input = { ...input, manifestPath: file, sha256: hashManifest(bad) };
        break;
      }
      case 'manifesto nao canonico': {
        const loose = JSON.stringify(JSON.parse(m.content));
        const file = path.join(tmpDir, 'solto.json');
        fs.writeFileSync(file, loose, 'utf8');
        input = { ...input, manifestPath: file, sha256: hashManifest(loose) };
        break;
      }
      case 'approve-count 0':
        input = recoverInput(m, [], { approveCount: 0 });
        break;
      case 'approve-count 26':
        m = writeManifest(makeEntries(26));
        input = recoverInput(m, makeEntries(26).map((e) => e.checkoutSessionId));
        break;
      case 'approve-count nao inteiro':
        input = { ...input, approveCount: 1.5 };
        break;
      case 'allowlist de tamanho errado':
        input = { ...input, approveCount: 3 };
        break;
      case 'id repetido na allowlist':
        input = recoverInput(m, [csId(1), csId(1)]);
        break;
      case 'id fora do manifesto':
        input = recoverInput(m, [csId(1), csId(99)]);
        break;
      case 'id excluded':
        input = recoverInput(m, [csId(1), csId(4)]);
        break;
      case 'id manual_review':
        input = recoverInput(m, [csId(1), csId(5)]);
        break;
      case 'revisao divergente da CLI':
        input = { ...input, circuitBreakerRevision: 'g6-v0' };
        break;
      case 'revisao divergente do manifesto':
        m = writeManifest(entries, 'g5-v9');
        input = recoverInput(m, [csId(1), csId(2)], { circuitBreakerRevision: 'g5-v9' });
        break;
    }

    await expect(recoverEbookDeliveries(input, { prisma: prismaDep })).rejects.toMatchObject({ code });
    expectNothingTouched();
  });
});

describe('delivery recovery: recover executa', () => {
  it('processa em lotes de 5 com no maximo 5 chamadas simultaneas', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.fulfill.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return { status: 'delivered' };
    });
    const entries = makeEntries(12);
    const m = writeManifest(entries);
    const report = await recoverEbookDeliveries(
      recoverInput(m, entries.map((e) => e.checkoutSessionId), { approveCount: 12 }),
      { prisma: prismaDep },
    );
    expect(EBOOK_RECOVERY_BATCH_SIZE).toBe(5);
    expect(maxActive).toBe(5);
    expect(mocks.fulfill).toHaveBeenCalledTimes(12);
    expect(report.counts.delivered).toBe(12);
    expect(report.breakerOpen).toBe(false);
  });

  it('um resultado por id na ordem do manifesto e uma unica composicao de deps repassada aos dois caminhos', async () => {
    orders.set(csId(2), makeOrder(2, { deliveryStatus: 'ACCEPTED' }));
    const entries: EbookRecoveryEntry[] = [
      { checkoutSessionId: csId(1), orderId: null, classification: 'affected', reason: null },
      { checkoutSessionId: csId(2), orderId: 'ord_fixture_2', classification: 'reconcile_status', reason: null },
      { checkoutSessionId: csId(3), orderId: null, classification: 'affected', reason: null },
    ];
    const m = writeManifest(entries);
    const seen: string[] = [];
    const report = await recoverEbookDeliveries(
      // allowlist em ordem diferente da do manifesto
      recoverInput(m, [csId(3), csId(2), csId(1)]),
      { prisma: prismaDep, onResult: (r) => seen.push(r.checkoutSessionId) },
    );
    expect(seen).toEqual([csId(1), csId(2), csId(3)]);
    expect(report.results.map((r) => r.checkoutSessionId)).toEqual([csId(1), csId(2), csId(3)]);
    expect(mocks.buildDeps).toHaveBeenCalledTimes(1);
    expect(mocks.fulfill).toHaveBeenCalledTimes(2);
    expect(mocks.fulfill.mock.calls[0]).toEqual([
      { checkoutSessionId: csId(1), trigger: 'recovery' },
      mocks.sentinel,
    ]);
    expect(mocks.fulfill.mock.calls[1]?.[1]).toBe(mocks.sentinel);
    // reconcile usa o id RELIDO como orderId
    expect(mocks.reconcileStatus).toHaveBeenCalledWith({ orderId: 'ord_fixture_2' }, mocks.sentinel);
  });

  it.each([
    ['payment_REFUNDED', { paymentStatus: 'REFUNDED' as const }],
    ['delivered', { deliveryStatus: 'DELIVERED' as const }],
    ['in_progress', { deliveryStatus: 'CLAIMED' as const, deliveryClaimedAt: new Date(NOW.getTime() - 1000) }],
    ['needs_review', { deliveryStatus: 'NEEDS_REVIEW' as const }],
    ['claimed_without_timestamp', { deliveryStatus: 'SENDING' as const }],
  ])('TOCTOU: releitura com %s vira skipped sem chamar o fulfillment', async (reason, patch) => {
    orders.set(csId(1), makeOrder(1, patch));
    const m = writeManifest(makeEntries(1));
    const report = await recoverEbookDeliveries(recoverInput(m, [csId(1)]), {
      prisma: prismaDep,
      now: () => NOW,
    });
    expect(report.results).toEqual([{ checkoutSessionId: csId(1), result: 'skipped', reason }]);
    expect(mocks.fulfill).not.toHaveBeenCalled();
    expect(mocks.reconcileStatus).not.toHaveBeenCalled();
  });

  it('TOCTOU: pedido sumido com orderId no manifesto vira skipped order_missing', async () => {
    const m = writeManifest([
      { checkoutSessionId: csId(1), orderId: 'ord_fixture_1', classification: 'affected', reason: null },
    ]);
    const report = await recoverEbookDeliveries(recoverInput(m, [csId(1)]), { prisma: prismaDep });
    expect(report.results).toEqual([{ checkoutSessionId: csId(1), result: 'skipped', reason: 'order_missing' }]);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it('TOCTOU: pedido ainda inexistente com orderId null segue para o fulfillment', async () => {
    const m = writeManifest(makeEntries(1));
    await recoverEbookDeliveries(recoverInput(m, [csId(1)]), { prisma: prismaDep });
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['delivered', 'delivered', null],
    ['accepted', 'accepted', null],
    ['in_progress', 'in_progress', null],
    ['needs_review', 'needs_review', null],
    ['not_ebook', 'skipped', 'not_ebook'],
    ['pending_payment', 'skipped', 'pending_payment'],
    ['failed_payment', 'skipped', 'failed_payment'],
    ['revoked', 'skipped', 'revoked'],
  ])('mapeia o status %s do fulfillment para %s (affected e reconcile_status)', async (status, result, reason) => {
    orders.set(csId(2), makeOrder(2, { deliveryStatus: 'ACCEPTED' }));
    mocks.fulfill.mockResolvedValue({ status });
    mocks.reconcileStatus.mockResolvedValue({ status });
    const m = writeManifest([
      { checkoutSessionId: csId(1), orderId: null, classification: 'affected', reason: null },
      { checkoutSessionId: csId(2), orderId: 'ord_fixture_2', classification: 'reconcile_status', reason: null },
    ]);
    const report = await recoverEbookDeliveries(recoverInput(m, [csId(1), csId(2)]), { prisma: prismaDep });
    expect(report.results).toEqual([
      { checkoutSessionId: csId(1), result, reason },
      { checkoutSessionId: csId(2), result, reason },
    ]);
  });

  it('repetir o mesmo manifesto nao reenvia: o fulfillment devolve delivered', async () => {
    const m = writeManifest(makeEntries(2));
    const input = recoverInput(m, [csId(1), csId(2)]);
    const first = await recoverEbookDeliveries(input, { prisma: prismaDep });
    const second = await recoverEbookDeliveries(input, { prisma: prismaDep });
    expect(first.counts.delivered).toBe(2);
    expect(second.counts.delivered).toBe(2);
    expect(second.counts.error).toBe(0);
    expect(mocks.fulfill.mock.calls.every(([arg]) => (arg as { trigger: string }).trigger === 'recovery')).toBe(true);
  });

  it('erro por id registra so o code e nunca a mensagem do gateway nem stack', async () => {
    mocks.fulfill.mockImplementation(async ({ checkoutSessionId }: { checkoutSessionId: string }) => {
      if (checkoutSessionId === csId(1)) {
        throw new AppError('GATEWAY_DOWN', 'gateway-secret-detail buyer-fixture-dominio', 502);
      }
      throw new Error('detalhe-interno-inesperado');
    });
    const m = writeManifest(makeEntries(2));
    const report = await recoverEbookDeliveries(recoverInput(m, [csId(1), csId(2)]), { prisma: prismaDep });
    expect(report.results).toEqual([
      { checkoutSessionId: csId(1), result: 'error', reason: 'GATEWAY_DOWN' },
      { checkoutSessionId: csId(2), result: 'error', reason: 'UNEXPECTED_ERROR' },
    ]);
    const logged = loggedMessages();
    expect(logged).toContain('GATEWAY_DOWN');
    expect(logged).not.toContain('gateway-secret-detail');
    expect(logged).not.toContain('detalhe-interno-inesperado');
    expect(logged).not.toMatch(/stack|at .*\(/i);
  });

  describe('breaker acumulado', () => {
    function failOn(ids: string[]): void {
      mocks.fulfill.mockImplementation(async ({ checkoutSessionId }: { checkoutSessionId: string }) => {
        if (ids.includes(checkoutSessionId)) throw new AppError('GATEWAY_DOWN', 'falha', 502);
        return { status: 'delivered' };
      });
    }

    it('1 erro em 10 (1/10) nao abre: 0.1 nao e maior que 0.1', async () => {
      failOn([csId(7)]);
      const entries = makeEntries(10);
      const m = writeManifest(entries);
      const report = await recoverEbookDeliveries(
        recoverInput(m, entries.map((e) => e.checkoutSessionId)),
        { prisma: prismaDep },
      );
      expect(report.breakerOpen).toBe(false);
      expect(report.results).toHaveLength(10);
      expect(report.counts.error).toBe(1);
    });

    it('1 erro no primeiro lote (1/5) abre e o segundo lote nao roda', async () => {
      failOn([csId(2)]);
      const entries = makeEntries(10);
      const m = writeManifest(entries);
      const report = await recoverEbookDeliveries(
        recoverInput(m, entries.map((e) => e.checkoutSessionId)),
        { prisma: prismaDep },
      );
      expect(report.breakerOpen).toBe(true);
      expect(report.results).toHaveLength(5);
      expect(mocks.fulfill).toHaveBeenCalledTimes(5);
    });

    it('2 erros em 15 (0.13) abrem ao fim do terceiro lote', async () => {
      failOn([csId(11), csId(12)]);
      const entries = makeEntries(15);
      const m = writeManifest(entries);
      const report = await recoverEbookDeliveries(
        recoverInput(m, entries.map((e) => e.checkoutSessionId)),
        { prisma: prismaDep },
      );
      expect(report.breakerOpen).toBe(true);
      expect(report.results).toHaveLength(15);
      expect(report.counts.error).toBe(2);
    });
  });
});

describe('delivery recovery: CLI', () => {
  async function run(argv: string[]) {
    const fake = makeIo();
    const code = await runEbooksDeliveryRecoveryCli(argv, fake.io);
    return { code, out: fake.out, err: fake.err, all: [...fake.out, ...fake.err].join('\n') };
  }

  function expectClean(all: string): void {
    expect(all).not.toContain('@');
    expect(all).not.toMatch(/at Object|node_modules|\.ts:\d+/);
  }

  it('--help sai 0 com o uso em stdout', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out.join('\n')).toContain('reconcile');
    expect(r.err).toEqual([]);
  });

  it.each([
    ['argv vazio', []],
    ['subcomando desconhecido', ['explodir']],
    ['flag desconhecida no reconcile', ['reconcile', '--bogus']],
    ['flag desconhecida no recover', ['recover', '--bogus']],
    ['argumento posicional extra', ['reconcile', 'solto']],
    ['recover sem flags obrigatorias', ['recover', '--manifest', 'x.json']],
    [
      'recover com approve-count nao numerico',
      ['recover', '--manifest', 'x', '--sha256', 'y', '--approve-count', 'abc', '--allowlist', 'a', '--circuit-breaker-revision', REV],
    ],
    ['evidence sem --order', ['evidence']],
    ['evidence com --order invalido', ['evidence', '--order', '../x']],
  ])('%s sai 1 sem tocar adapters', async (_label, argv) => {
    const r = await run(argv);
    expect(r.code).toBe(1);
    expectClean(r.all);
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it('reconcile --execute e recusado como dry-run', async () => {
    const r = await run(['reconcile', '--execute']);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('dry-run');
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it.each([
    ['sem --from', ['reconcile', '--to', '2026-10-02', '--timezone', 'UTC']],
    ['sem --to', ['reconcile', '--from', '2026-10-01', '--timezone', 'UTC']],
    ['sem --timezone', ['reconcile', '--from', '2026-10-01', '--to', '2026-10-02']],
    ['from >= to', ['reconcile', '--from', '2026-10-02', '--to', '2026-10-01', '--timezone', 'UTC']],
    ['janela acima de 90 dias', ['reconcile', '--from', '2026-01-01', '--to', '2026-06-01', '--timezone', 'UTC']],
    ['timezone invalida', ['reconcile', '--from', '2026-10-01', '--to', '2026-10-02', '--timezone', 'Marte/Olympus']],
  ])('reconcile %s sai 1 com mensagem objetiva sem chamar o Stripe', async (_label, argv) => {
    const r = await run(argv);
    expect(r.code).toBe(1);
    expect(r.err.join('\n').length).toBeGreaterThan(0);
    expectClean(r.all);
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it('reconcile feliz imprime so referencia, hash e contagens', async () => {
    const list = vi.fn().mockResolvedValue({ data: [makeSession(1), makeSession(2)], has_more: false });
    mocks.getStripe.mockReturnValue({ checkout: { sessions: { list } } });
    orders.set(csId(2), makeOrder(2, { deliveryStatus: 'DELIVERED' }));
    const out = path.join(tmpDir, 'cli.json');
    const r = await run(['reconcile', '--from', '2026-10-01', '--to', '2026-10-10', '--timezone', 'America/Sao_Paulo', '--out', out]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(`manifest=${out}`);
    expect(r.out[1]).toBe(`sha256=${hashManifest(fs.readFileSync(out, 'utf8'))}`);
    expect(r.out.slice(2)).toEqual(['scanned=2', 'affected=1', 'reconcile_status=0', 'manual_review=0', 'excluded=1']);
    expectClean(r.all);
  });

  it('recover sem --execute imprime o plano e sai 0', async () => {
    const m = writeManifest(makeEntries(2));
    const r = await run([
      'recover', '--manifest', m.file, '--sha256', m.sha256, '--approve-count', '2',
      '--allowlist', `${csId(1)},${csId(2)}`, '--circuit-breaker-revision', REV,
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([`plan ${csId(1)} fulfill`, `plan ${csId(2)} fulfill`, 'mode=plan approved=2']);
    expectNothingTouched();
  });

  it('recover --execute com erro por id sai 1 e a saida nao vaza mensagem nem stack', async () => {
    mocks.fulfill.mockRejectedValue(new AppError('GATEWAY_DOWN', 'gateway-secret-detail', 502));
    const m = writeManifest(makeEntries(1));
    const r = await run([
      'recover', '--manifest', m.file, '--sha256', m.sha256, '--approve-count', '1',
      '--allowlist', csId(1), '--circuit-breaker-revision', REV, '--execute',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`result ${csId(1)} error reason=GATEWAY_DOWN`);
    expect(r.all).not.toContain('gateway-secret-detail');
    expectClean(r.all);
  });

  it('recover com sha divergente sai 1 com o codigo do erro', async () => {
    const m = writeManifest(makeEntries(1));
    const r = await run([
      'recover', '--manifest', m.file, '--sha256', '0'.repeat(64), '--approve-count', '1',
      '--allowlist', csId(1), '--circuit-breaker-revision', REV, '--execute',
    ]);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('EBOOK_RECOVERY_SHA_MISMATCH');
    expectNothingTouched();
  });
});
