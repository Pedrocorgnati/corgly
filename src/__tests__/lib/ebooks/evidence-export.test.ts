// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  EBOOK_EVIDENCE_MAX_BYTES,
  EbookEvidenceError,
  buildEbookOrderEvidence,
  type EbookEvidenceDeps,
} from '@/lib/ebooks/evidence-export';

const NOW_MS = Date.UTC(2024, 0, 15, 12, 0, 0);
const NOW_ISO = '2024-01-15T12:00:00.000Z';
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type CallArgs = Record<string, unknown>;

function makeOrderRow(overrides: CallArgs = {}): CallArgs {
  return {
    id: 'order_fixture_1',
    checkoutSessionId: 'cs_test_fixture_1',
    slug: 'slug-ficticio',
    locale: 'pt',
    purchasedAt: new Date('2024-01-10T08:30:00.000Z'),
    amountTotal: 4990,
    currency: 'brl',
    paymentStatus: 'PAID',
    deliveryStatus: 'DELIVERED',
    billingCountry: 'BR',
    cardCountry: 'BR',
    email: 'buyer@example.test',
    withdrawalWaiverAt: null,
    withdrawalWaiverVersion: null,
    firstDownloadAt: new Date('2024-01-11T09:00:00.000Z'),
    refundedAt: null,
    refundedAmount: 0,
    disputedAt: null,
    disputeId: null,
    disputeStatus: null,
    ...overrides,
  };
}

interface FakeState {
  order: CallArgs | null;
  deliveryEvents: CallArgs[];
  accesses: CallArgs[];
  tokens: CallArgs[];
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    order: makeOrderRow(),
    deliveryEvents: [
      {
        event: 'delivery_attempt',
        result: 'accepted',
        detail: 'smtp aceitou',
        createdAt: new Date('2024-01-10T08:31:00.000Z'),
      },
      {
        event: 'delivery_confirmed',
        result: 'delivered',
        detail: null,
        createdAt: new Date('2024-01-10T08:32:00.000Z'),
      },
    ],
    accesses: [
      { accessedAt: new Date('2024-01-11T09:00:00.000Z'), ip: '203.0.113.7' },
      { accessedAt: new Date('2024-01-12T10:00:00.000Z'), ip: '198.51.100.4' },
    ],
    tokens: [{ downloadCount: 2, revokedAt: null, revokedReason: null }],
    ...overrides,
  };
}

interface FakeCalls {
  orderFindUnique: CallArgs[];
  deliveryEventFindMany: CallArgs[];
  accessLogFindMany: CallArgs[];
  accessTokenFindMany: CallArgs[];
}

function makeDeps(state: FakeState): { deps: EbookEvidenceDeps; calls: FakeCalls } {
  const calls: FakeCalls = {
    orderFindUnique: [],
    deliveryEventFindMany: [],
    accessLogFindMany: [],
    accessTokenFindMany: [],
  };
  const prisma = {
    ebookOrder: {
      findUnique: (args: CallArgs) => {
        calls.orderFindUnique.push(args);
        return Promise.resolve(state.order);
      },
    },
    ebookDeliveryEvent: {
      findMany: (args: CallArgs) => {
        calls.deliveryEventFindMany.push(args);
        return Promise.resolve(state.deliveryEvents);
      },
    },
    ebookAccessLog: {
      findMany: (args: CallArgs) => {
        calls.accessLogFindMany.push(args);
        return Promise.resolve(state.accesses);
      },
    },
    ebookAccessToken: {
      findMany: (args: CallArgs) => {
        calls.accessTokenFindMany.push(args);
        return Promise.resolve(state.tokens);
      },
    },
  } as unknown as EbookEvidenceDeps['prisma'];
  return { deps: { prisma, now: () => new Date(NOW_MS) }, calls };
}

interface DocumentoLido {
  schemaVersion: number;
  generatedAt: string;
  order: Record<string, unknown>;
  deliveryEvents: Record<string, unknown>[];
  accesses: Record<string, unknown>[];
  tokens: Record<string, unknown>[];
}

function lerDocumento(json: string): DocumentoLido {
  return JSON.parse(json) as DocumentoLido;
}

describe('buildEbookOrderEvidence', () => {
  it('pedido completo devolve todos os campos de order, eventos e acessos em ordem cronologica e tokens sem tokenHash', async () => {
    const { deps, calls } = makeDeps(makeState());

    const resultado = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);
    const documento = lerDocumento(resultado.json);

    expect(documento.schemaVersion).toBe(1);
    expect(documento.generatedAt).toBe(NOW_ISO);
    expect(documento.order).toEqual({
      id: 'order_fixture_1',
      checkoutSessionId: 'cs_test_fixture_1',
      slug: 'slug-ficticio',
      locale: 'pt',
      purchasedAt: '2024-01-10T08:30:00.000Z',
      amountTotal: 4990,
      currency: 'brl',
      paymentStatus: 'PAID',
      deliveryStatus: 'DELIVERED',
      billingCountry: 'BR',
      cardCountry: 'BR',
      email: 'buyer@example.test',
      withdrawalWaiverAt: null,
      withdrawalWaiverVersion: null,
      firstDownloadAt: '2024-01-11T09:00:00.000Z',
      refundedAt: null,
      refundedAmount: 0,
      disputedAt: null,
      disputeId: null,
      disputeStatus: null,
    });
    expect(documento.deliveryEvents).toEqual([
      {
        event: 'delivery_attempt',
        result: 'accepted',
        detail: 'smtp aceitou',
        createdAt: '2024-01-10T08:31:00.000Z',
      },
      {
        event: 'delivery_confirmed',
        result: 'delivered',
        detail: null,
        createdAt: '2024-01-10T08:32:00.000Z',
      },
    ]);
    expect(documento.accesses).toEqual([
      { accessedAt: '2024-01-11T09:00:00.000Z', ip: '203.0.113.7' },
      { accessedAt: '2024-01-12T10:00:00.000Z', ip: '198.51.100.4' },
    ]);
    expect(documento.tokens).toEqual([
      { downloadCount: 2, revokedAt: null, revokedReason: null },
    ]);
    expect(resultado.json).not.toContain('tokenHash');

    // As leituras pedem ordem cronologica com desempate por id.
    expect(calls.deliveryEventFindMany[0]).toMatchObject({
      where: { orderId: 'order_fixture_1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(calls.accessLogFindMany[0]).toMatchObject({
      where: { orderId: 'order_fixture_1' },
      orderBy: [{ accessedAt: 'asc' }, { id: 'asc' }],
    });
    expect(calls.accessTokenFindMany[0]).toMatchObject({
      where: { orderId: 'order_fixture_1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('campos nulos aparecem como null e nunca sao omitidos', async () => {
    const state = makeState({
      order: makeOrderRow({
        billingCountry: null,
        cardCountry: null,
        withdrawalWaiverAt: null,
        withdrawalWaiverVersion: null,
        firstDownloadAt: null,
        refundedAt: null,
        refundedAmount: 0,
        disputedAt: null,
        disputeId: null,
        disputeStatus: null,
      }),
      deliveryEvents: [
        {
          event: 'delivery_attempt',
          result: 'accepted',
          detail: null,
          createdAt: new Date('2024-01-10T08:31:00.000Z'),
        },
      ],
      accesses: [{ accessedAt: new Date('2024-01-11T09:00:00.000Z'), ip: '203.0.113.7' }],
      tokens: [{ downloadCount: 0, revokedAt: null, revokedReason: null }],
    });
    const { deps } = makeDeps(state);

    const resultado = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);
    const documento = lerDocumento(resultado.json);

    const camposNulos = [
      'billingCountry',
      'cardCountry',
      'withdrawalWaiverAt',
      'withdrawalWaiverVersion',
      'firstDownloadAt',
      'refundedAt',
      'disputedAt',
      'disputeId',
      'disputeStatus',
    ];
    for (const campo of camposNulos) {
      expect(campo in documento.order).toBe(true);
      expect(documento.order[campo]).toBeNull();
      expect(resultado.json).toContain('"' + campo + '": null');
    }
    expect('detail' in documento.deliveryEvents[0]).toBe(true);
    expect(documento.deliveryEvents[0].detail).toBeNull();
    expect('revokedAt' in documento.tokens[0]).toBe(true);
    expect(documento.tokens[0].revokedAt).toBeNull();
    expect(documento.tokens[0].revokedReason).toBeNull();
  });

  it('toda data sai em ISO UTC', async () => {
    const state = makeState({
      order: makeOrderRow({
        withdrawalWaiverAt: new Date('2024-01-12T11:00:00.000Z'),
        withdrawalWaiverVersion: 'v1',
        refundedAt: new Date('2024-01-13T11:00:00.000Z'),
        refundedAmount: 4990,
        disputedAt: new Date('2024-01-14T11:00:00.000Z'),
        disputeId: 'dp_fixture_1',
        disputeStatus: 'needs_response',
      }),
      tokens: [
        {
          downloadCount: 1,
          revokedAt: new Date('2024-01-14T12:00:00.000Z'),
          revokedReason: 'refunded',
        },
      ],
    });
    const { deps } = makeDeps(state);

    const resultado = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);
    const documento = lerDocumento(resultado.json);

    const datas = [
      documento.generatedAt,
      documento.order.purchasedAt,
      documento.order.withdrawalWaiverAt,
      documento.order.firstDownloadAt,
      documento.order.refundedAt,
      documento.order.disputedAt,
      documento.deliveryEvents[0].createdAt,
      documento.accesses[0].accessedAt,
      documento.tokens[0].revokedAt,
    ];
    for (const data of datas) {
      expect(data).toMatch(ISO_UTC);
    }
    expect(documento.order.purchasedAt).toBe('2024-01-10T08:30:00.000Z');
    expect(documento.generatedAt).toBe(NOW_ISO);
  });

  it('pedido inexistente lanca EbookEvidenceError com code EBOOK_EVIDENCE_ORDER_NOT_FOUND', async () => {
    const { deps, calls } = makeDeps(makeState({ order: null }));

    let devolvido: unknown = null;
    let lancado: unknown = null;
    try {
      devolvido = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);
    } catch (erro) {
      lancado = erro;
    }

    expect(devolvido).toBeNull();
    expect(lancado).toBeInstanceOf(EbookEvidenceError);
    expect(lancado).toMatchObject({ code: 'EBOOK_EVIDENCE_ORDER_NOT_FOUND' });
    expect(calls.orderFindUnique).toHaveLength(1);
    // Sem pedido nao ha leitura de eventos, acessos nem tokens.
    expect(calls.deliveryEventFindMany).toHaveLength(0);
    expect(calls.accessLogFindMany).toHaveLength(0);
    expect(calls.accessTokenFindMany).toHaveLength(0);
  });

  it('documento acima do teto lanca EBOOK_EVIDENCE_TOO_LARGE e nao devolve json parcial', async () => {
    expect(EBOOK_EVIDENCE_MAX_BYTES).toBe(4.5 * 1024 * 1024);
    // Acessos sinteticos o bastante para passar de 4.5 MB em UTF-8.
    const accesses = Array.from({ length: 60000 }, (_, indice) => ({
      accessedAt: new Date(NOW_MS + indice * 1000),
      ip: '203.0.113.7',
    }));
    const { deps } = makeDeps(makeState({ accesses }));

    let devolvido: unknown = null;
    let lancado: unknown = null;
    try {
      devolvido = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);
    } catch (erro) {
      lancado = erro;
    }

    expect(devolvido).toBeNull();
    expect(lancado).toBeInstanceOf(EbookEvidenceError);
    expect(lancado).toMatchObject({ code: 'EBOOK_EVIDENCE_TOO_LARGE' });
  });

  it('bytes devolvido bate com Buffer.byteLength do json em UTF-8', async () => {
    const { deps } = makeDeps(makeState());

    const resultado = await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);

    expect(resultado.bytes).toBe(Buffer.byteLength(resultado.json, 'utf8'));
    expect(resultado.bytes).toBeLessThan(EBOOK_EVIDENCE_MAX_BYTES);
    expect(resultado.json.endsWith('}\n')).toBe(true);
  });

  it('select do findUnique do pedido e do findMany de tokens nunca pede tokenHash', async () => {
    const { deps, calls } = makeDeps(makeState());

    await buildEbookOrderEvidence({ orderId: 'order_fixture_1' }, deps);

    const selectPedido = (calls.orderFindUnique[0] as { select: Record<string, unknown> }).select;
    expect(Object.keys(selectPedido)).not.toContain('tokenHash');
    expect(JSON.stringify(selectPedido)).not.toContain('tokenHash');
    expect([...Object.keys(selectPedido)].sort()).toEqual(
      [
        'amountTotal',
        'billingCountry',
        'cardCountry',
        'checkoutSessionId',
        'currency',
        'deliveryStatus',
        'disputeId',
        'disputeStatus',
        'disputedAt',
        'email',
        'firstDownloadAt',
        'id',
        'locale',
        'paymentStatus',
        'purchasedAt',
        'refundedAmount',
        'refundedAt',
        'slug',
        'withdrawalWaiverAt',
        'withdrawalWaiverVersion',
      ].sort(),
    );

    const selectTokens = (calls.accessTokenFindMany[0] as { select: Record<string, unknown> })
      .select;
    expect(Object.keys(selectTokens)).not.toContain('tokenHash');
    expect(JSON.stringify(selectTokens)).not.toContain('tokenHash');
    expect([...Object.keys(selectTokens)].sort()).toEqual(
      ['downloadCount', 'revokedAt', 'revokedReason'].sort(),
    );

    const selectAcessos = (calls.accessLogFindMany[0] as { select: Record<string, unknown> }).select;
    expect(Object.keys(selectAcessos)).not.toContain('tokenHash');
    expect([...Object.keys(selectAcessos)].sort()).toEqual(['accessedAt', 'ip'].sort());
  });
});
