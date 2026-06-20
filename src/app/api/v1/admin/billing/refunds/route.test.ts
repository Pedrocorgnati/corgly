// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockTransactionRefundRequestUpdate = vi.hoisted(() => vi.fn());
const mockTransactionPaymentUpdate = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  payment: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  refundRequest: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
  },
}));
const mockRefundsCreate = vi.hoisted(() => vi.fn());
const mockResolveRequestIdempotencyKey = vi.hoisted(() => vi.fn());
const mockRunIdempotency = vi.hoisted(() => vi.fn());
const mockAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ refunds: { create: mockRefundsCreate } }),
}));
vi.mock('@/lib/billing/idempotency.service', () => ({
  resolveRequestIdempotencyKey: mockResolveRequestIdempotencyKey,
  financialIdempotencyService: { run: mockRunIdempotency },
}));
vi.mock('@/lib/audit/audit-logger', () => ({ auditLog: mockAuditLog }));

import { GET, POST } from './route';
import { AppError } from '@/lib/errors';

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/v1/admin/billing/refunds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function getRequest(url = 'http://localhost/api/v1/admin/billing/refunds') {
  return new NextRequest(url, { method: 'GET' });
}

function refundRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rr-1',
    paymentId: 'pay-1',
    userId: 'user-1',
    reason: 'Pedido do aluno',
    status: 'PENDING',
    createdAt: new Date('2026-06-18T12:00:00.000Z'),
    updatedAt: new Date('2026-06-18T12:00:00.000Z'),
    payment: {
      id: 'pay-1',
      userId: 'user-1',
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_123',
      amount: 2500,
      currency: 'usd',
    },
    user: { email: 'student@example.com' },
    ...overrides,
  };
}

describe('POST /api/v1/admin/billing/refunds idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 });
    mockResolveRequestIdempotencyKey.mockReturnValue('refund-key-123');
    mockPrisma.$transaction.mockImplementation(async (operation) =>
      operation({
        refundRequest: { update: mockTransactionRefundRequestUpdate },
        payment: { update: mockTransactionPaymentUpdate },
      }),
    );
    mockPrisma.refundRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'user-1',
      stripePaymentIntentId: 'pi_123',
      amount: 2500,
      currency: 'usd',
      status: 'SUCCEEDED',
    });
    mockRefundsCreate.mockResolvedValue({
      id: 're_123',
      amount: 2500,
      currency: 'usd',
      status: 'succeeded',
    });
  });

  it('aprova refund request com claim de processamento, Stripe e audit log', async () => {
    mockPrisma.refundRequest.findUnique
      .mockResolvedValueOnce(refundRequest())
      .mockResolvedValueOnce({
        id: 'rr-1',
        paymentId: 'pay-1',
        status: 'PENDING',
        payment: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_123',
          amount: 2500,
          currency: 'usd',
        },
      })
      .mockResolvedValueOnce(refundRequest({ status: 'APPROVED' }));
    mockRunIdempotency.mockImplementation(
      async (
        scope: string,
        ownerId: string,
        key: string,
        payload: unknown,
        operation: (idempotencyKey: string) => Promise<unknown>,
      ) => {
        expect(scope).toBe('admin_refund');
        expect(ownerId).toBe('rr-1');
        expect(key).toBe('refund-key-123');
        expect(payload).toEqual({
          requestId: 'rr-1',
          reason: 'Aprovar reembolso solicitado.',
          action: 'approve',
        });
        return { result: await operation('scoped-refund-key'), idempotentReplay: false };
      },
    );

    const res = await POST(
      request(
        { requestId: 'rr-1', action: 'approve', reason: 'Aprovar reembolso solicitado.' },
        { 'X-Idempotency-Key': 'refund-key-123' },
      ),
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.refundRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'rr-1',
        status: { in: ['PENDING', 'STRIPE_FAILED', 'STRIPE_PROCESSING'] },
      },
      data: { status: 'STRIPE_PROCESSING' },
    });
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        amount: 2500,
        metadata: { refundRequestId: 'rr-1', paymentId: 'pay-1' },
      }),
      { idempotencyKey: 'scoped-refund-key' },
    );
    expect(mockTransactionRefundRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'rr-1' },
      data: { status: 'APPROVED' },
    });
    expect(mockTransactionPaymentUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'REFUNDED' },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ADMIN_REFUND_APPROVED',
      { type: 'RefundRequest', id: 'rr-1' },
      'admin-1',
      expect.objectContaining({ stripeRefundId: 're_123' }),
    );
  });

  it('rejeita refund request com update condicional e audit log unico', async () => {
    mockPrisma.refundRequest.findUnique
      .mockResolvedValueOnce(refundRequest())
      .mockResolvedValueOnce(refundRequest({ status: 'REJECTED' }));

    const res = await POST(
      request({ requestId: 'rr-1', action: 'reject', reason: 'Recusar por regra comercial.' }),
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.refundRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'rr-1', status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ADMIN_REFUND_REJECTED',
      { type: 'RefundRequest', id: 'rr-1' },
      'admin-1',
      expect.objectContaining({ adminReason: 'Recusar por regra comercial.' }),
    );
  });

  it('exige motivo administrativo com pelo menos 5 caracteres', async () => {
    const res = await POST(request({ requestId: 'rr-1', action: 'approve', reason: 'abc' }));

    expect(res.status).toBe(400);
    expect(mockRunIdempotency).not.toHaveBeenCalled();
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  it('lista STRIPE_FAILED como STRIPE_FAILURE para a UI', async () => {
    mockPrisma.refundRequest.findMany.mockResolvedValue([
      refundRequest({ id: 'rr-failed', status: 'STRIPE_FAILED' }),
    ]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0]).toEqual(
      expect.objectContaining({
        id: 'rr-failed',
        requestStatus: 'STRIPE_FAILED',
        displayStatus: 'STRIPE_FAILURE',
      }),
    );
  });

  it('cria refund uma vez usando Idempotency-Key', async () => {
    mockRunIdempotency.mockImplementation(
      async (
        _scope: string,
        _ownerId: string,
        _key: string,
        _payload: unknown,
        operation: (idempotencyKey: string) => Promise<unknown>,
      ) => ({ result: await operation('scoped-refund-key'), idempotentReplay: false }),
    );

    const res = await POST(
      request(
        { paymentId: 'pay-1', amount: 2500 },
        { 'X-Idempotency-Key': 'refund-key-123' },
      ),
    );

    expect(res.status).toBe(201);
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        amount: 2500,
        reason: 'requested_by_customer',
      }),
      { idempotencyKey: 'scoped-refund-key' },
    );
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'REFUNDED' },
    });
  });

  it('replay retorna resultado salvo sem criar novo refund financeiro', async () => {
    mockRunIdempotency.mockResolvedValue({
      result: {
        paymentId: 'pay-1',
        refundId: 're_cached',
        amount: 2500,
        currency: 'usd',
        status: 'succeeded',
      },
      idempotentReplay: true,
    });

    const res = await POST(
      request({ paymentId: 'pay-1', amount: 2500 }, { 'Idempotency-Key': 'refund-key-123' }),
    );

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.data).toEqual({
      refund: {
        paymentId: 'pay-1',
        refundId: 're_cached',
        amount: 2500,
        currency: 'usd',
        status: 'succeeded',
      },
      idempotentReplay: true,
    });
  });

  it('payload divergente para mesma chave retorna 409 sem criar refund', async () => {
    mockRunIdempotency.mockRejectedValue(
      new AppError('PAYMENT_064', 'Idempotency-Key reutilizada com payload divergente.', 409),
    );

    const res = await POST(
      request({ paymentId: 'pay-1', amount: 2000 }, { 'Idempotency-Key': 'refund-key-123' }),
    );

    expect(res.status).toBe(409);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe('Idempotency-Key reutilizada com payload divergente.');
  });

  it('concorrência simples com mesma chave retorna 409 sem criar refund', async () => {
    mockRunIdempotency.mockRejectedValue(
      new AppError(
        'PAYMENT_065',
        'Operação financeira já está em processamento para esta Idempotency-Key.',
        409,
      ),
    );

    const res = await POST(
      request({ paymentId: 'pay-1', amount: 2500 }, { 'X-Idempotency-Key': 'refund-key-123' }),
    );

    expect(res.status).toBe(409);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe('Operação financeira já está em processamento para esta Idempotency-Key.');
  });

  it('registra falha Stripe auditável para UI exibir STRIPE_FAILURE', async () => {
    mockPrisma.refundRequest.findUnique
      .mockResolvedValueOnce(refundRequest())
      .mockResolvedValueOnce({
        id: 'rr-1',
        paymentId: 'pay-1',
        status: 'PENDING',
        payment: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_123',
          amount: 2500,
          currency: 'usd',
        },
      });
    mockRefundsCreate.mockRejectedValue(new Error('Stripe unavailable'));
    mockRunIdempotency.mockImplementation(
      async (
        _scope: string,
        _ownerId: string,
        _key: string,
        _payload: unknown,
        operation: (idempotencyKey: string) => Promise<unknown>,
      ) => ({ result: await operation('scoped-refund-key'), idempotentReplay: false }),
    );

    const res = await POST(
      request(
        { requestId: 'rr-1', action: 'approve', reason: 'Aprovar reembolso solicitado.' },
        { 'X-Idempotency-Key': 'refund-key-123' },
      ),
    );

    expect(res.status).toBe(500);
    expect(mockPrisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: 'rr-1' },
      data: { status: 'STRIPE_FAILED' },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ADMIN_REFUND_STRIPE_FAILED',
      { type: 'RefundRequest', id: 'rr-1' },
      'admin-1',
      expect.objectContaining({
        paymentId: 'pay-1',
        userId: 'user-1',
        adminReason: 'Aprovar reembolso solicitado.',
        error: 'Stripe unavailable',
      }),
    );
  });
});
