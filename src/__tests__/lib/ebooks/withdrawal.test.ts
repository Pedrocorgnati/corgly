// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveEbookAccess: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/ebooks/access', () => ({ resolveEbookAccess: mocks.resolveEbookAccess }));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

import type {
  EbookAccessDeps,
  EbookAccessOrder,
  EbookAccessResult,
} from '@/lib/ebooks/access';
import {
  EBOOK_WITHDRAWAL_WINDOW_MS,
  getEbookWithdrawalView,
  isEbookWithdrawalStatus,
  requestEbookWithdrawal,
  type EbookWithdrawalDeps,
} from '@/lib/ebooks/withdrawal';

const NOW_MS = Date.UTC(2024, 0, 15, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function makeOrder(overrides: Partial<EbookAccessOrder> = {}): EbookAccessOrder {
  return {
    id: 'order_teste_1',
    slug: 'slug-ficticio',
    locale: 'pt',
    paymentStatus: 'PAID',
    stripePaymentIntentId: 'pi_test_123',
    firstDownloadAt: null,
    createdAt: new Date(NOW_MS - DAY_MS),
    ...overrides,
  };
}

function makeAccessDeps(): { deps: EbookAccessDeps; fns: Array<ReturnType<typeof vi.fn>> } {
  const fns = {
    accessTokenFindUnique: vi.fn(),
    orderFindUnique: vi.fn(),
    orderUpdateMany: vi.fn(),
    accessLogCreate: vi.fn(),
    transaction: vi.fn(),
    rateLimit: vi.fn(),
    privateDir: vi.fn(),
    cwd: vi.fn(),
    checkPdf: vi.fn(),
    now: vi.fn(),
    downloadLimit: vi.fn(),
  };
  const deps = {
    prisma: {
      ebookAccessToken: { findUnique: fns.accessTokenFindUnique },
      ebookOrder: { findUnique: fns.orderFindUnique, updateMany: fns.orderUpdateMany },
      ebookAccessLog: { create: fns.accessLogCreate },
      $transaction: fns.transaction,
    },
    catalog: [],
    rateLimit: fns.rateLimit,
    privateDir: fns.privateDir,
    cwd: fns.cwd,
    checkPdf: fns.checkPdf,
    now: fns.now,
    downloadLimit: fns.downloadLimit,
  } as unknown as EbookAccessDeps;
  return { deps, fns: Object.values(fns) };
}

function makeWithdrawalDeps(refundsCreate: ReturnType<typeof vi.fn>): {
  deps: EbookWithdrawalDeps;
  eventCreate: ReturnType<typeof vi.fn>;
  orderFindUnique: ReturnType<typeof vi.fn>;
} {
  const eventCreate = vi.fn().mockResolvedValue({});
  const orderFindUnique = vi.fn().mockResolvedValue({ firstDownloadAt: null });
  const deps = {
    prisma: {
      ebookDeliveryEvent: { create: eventCreate },
      ebookOrder: { findUnique: orderFindUnique },
    },
    stripe: { refunds: { create: refundsCreate } },
  } as unknown as EbookWithdrawalDeps;
  return { deps, eventCreate, orderFindUnique };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEbookWithdrawalView', () => {
  it('resolve o acesso com requirePdf: false, repassa o resultado e nao toca prisma nem checkPdf', async () => {
    const { deps, fns } = makeAccessDeps();
    const resultado: EbookAccessResult = {
      kind: 'invalid',
      status: 404,
      locale: 'pt',
      message: 'mensagem de teste',
    };
    mocks.resolveEbookAccess.mockResolvedValue(resultado);

    const devolvido = await getEbookWithdrawalView(deps, {
      token: 'token-teste',
      ip: '203.0.113.7',
      acceptLanguage: 'pt',
    });

    expect(mocks.resolveEbookAccess).toHaveBeenCalledTimes(1);
    expect(mocks.resolveEbookAccess).toHaveBeenCalledWith(deps, {
      token: 'token-teste',
      ip: '203.0.113.7',
      acceptLanguage: 'pt',
      requirePdf: false,
    });
    expect(devolvido).toBe(resultado);
    for (const fn of fns) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mocks.logger.warn).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });
});

describe('requestEbookWithdrawal', () => {
  it('pedido elegivel cria estorno com idempotencia, grava refund_requested e devolve accepted', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);

    const resposta = await requestEbookWithdrawal(deps, { order: makeOrder(), now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'accepted' });
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_test_123',
        reason: 'requested_by_customer',
        metadata: { kind: 'ebook', reason: 'withdrawal' },
      },
      { idempotencyKey: 'ebook-withdrawal:order_teste_1' },
    );
    expect(eventCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith({
      data: { orderId: 'order_teste_1', event: 'withdrawal_requested', result: 'refund_requested' },
    });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('download ja iniciado vira review com detail download_started e nao cria estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({ firstDownloadAt: new Date(NOW_MS - 1000) });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order_teste_1',
        event: 'withdrawal_requested',
        result: 'needs_review',
        detail: 'download_started',
      },
    });
  });

  it('download gravado entre a tela e o POST (TOCTOU) vira review sem estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate, orderFindUnique } = makeWithdrawalDeps(refundsCreate);
    orderFindUnique.mockResolvedValue({ firstDownloadAt: new Date(NOW_MS - 500) });

    const resposta = await requestEbookWithdrawal(deps, { order: makeOrder(), now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(orderFindUnique).toHaveBeenCalledWith({
      where: { id: 'order_teste_1' },
      select: { firstDownloadAt: true },
    });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order_teste_1',
        event: 'withdrawal_requested',
        result: 'needs_review',
        detail: 'download_started',
      },
    });
  });

  it('pedido sumido na releitura vira review com not_eligible e nao cria estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate, orderFindUnique } = makeWithdrawalDeps(refundsCreate);
    orderFindUnique.mockResolvedValue(null);

    const resposta = await requestEbookWithdrawal(deps, { order: makeOrder(), now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate.mock.calls[0]?.[0]).toMatchObject({ data: { detail: 'not_eligible' } });
  });

  it('download iniciado vence a janela vencida (ordem D8)', async () => {
    const refundsCreate = vi.fn();
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({
      firstDownloadAt: new Date(NOW_MS - 20 * DAY_MS),
      createdAt: new Date(NOW_MS - 30 * DAY_MS),
    });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(eventCreate.mock.calls[0]?.[0]).toMatchObject({ data: { detail: 'download_started' } });
  });

  it('pedido com 15 dias vira expired e nao cria estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({ createdAt: new Date(NOW_MS - 15 * DAY_MS) });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'expired' });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalledWith({
      data: { orderId: 'order_teste_1', event: 'withdrawal_requested', result: 'expired' },
    });
  });

  it('pedido com exatamente 14 dias ainda e elegivel', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({ createdAt: new Date(NOW_MS - EBOOK_WITHDRAWAL_WINDOW_MS) });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'accepted' });
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith({
      data: { orderId: 'order_teste_1', event: 'withdrawal_requested', result: 'refund_requested' },
    });
  });

  it('PARTIALLY_REFUNDED vira review com detail not_eligible e nao cria estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({ paymentStatus: 'PARTIALLY_REFUNDED' });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order_teste_1',
        event: 'withdrawal_requested',
        result: 'needs_review',
        detail: 'not_eligible',
      },
    });
  });

  it('payment intent nulo vira review com detail not_eligible e nao cria estorno', async () => {
    const refundsCreate = vi.fn().mockResolvedValue({ id: 're_teste' });
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);
    const order = makeOrder({ stripePaymentIntentId: null });

    const resposta = await requestEbookWithdrawal(deps, { order, now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'review' });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order_teste_1',
        event: 'withdrawal_requested',
        result: 'needs_review',
        detail: 'not_eligible',
      },
    });
  });

  it('falha do gateway vira refund_failed com detail gateway_error e nao vaza a mensagem do gateway', async () => {
    const refundsCreate = vi.fn().mockRejectedValue(new Error('gateway secret message'));
    const { deps, eventCreate } = makeWithdrawalDeps(refundsCreate);

    const resposta = await requestEbookWithdrawal(deps, { order: makeOrder(), now: new Date(NOW_MS) });

    expect(resposta).toEqual({ status: 'error' });
    expect(eventCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order_teste_1',
        event: 'withdrawal_requested',
        result: 'refund_failed',
        detail: 'gateway_error',
      },
    });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn.mock.calls[0]?.[0]).toBe('[ebooks-withdrawal] estorno falhou');
    const argumentos = JSON.stringify([...eventCreate.mock.calls, ...mocks.logger.warn.mock.calls]);
    expect(argumentos).not.toContain('gateway secret message');
  });
});

describe('isEbookWithdrawalStatus', () => {
  it('aceita os quatro status e recusa valores invalidos', () => {
    expect(isEbookWithdrawalStatus('accepted')).toBe(true);
    expect(isEbookWithdrawalStatus('review')).toBe(true);
    expect(isEbookWithdrawalStatus('expired')).toBe(true);
    expect(isEbookWithdrawalStatus('error')).toBe(true);

    expect(isEbookWithdrawalStatus('x')).toBe(false);
    expect(isEbookWithdrawalStatus(undefined)).toBe(false);
    expect(isEbookWithdrawalStatus(1)).toBe(false);
  });
});
