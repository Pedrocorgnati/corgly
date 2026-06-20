// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockRequestRefund = vi.hoisted(() => vi.fn());
const mockGetExistingForPayment = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));

vi.mock('@/lib/billing/refund-request.service', () => ({
  refundRequestService: {
    getExistingForPayment: mockGetExistingForPayment,
    requestRefund: mockRequestRefund,
  },
}));

import { GET, POST } from './route';

const createdRefund = {
  refundRequest: {
    id: 'rr-1',
    paymentId: 'pay-1',
    userId: 'user-1',
    reason: 'Motivo do aluno',
    status: 'PENDING',
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
  },
  idempotentReplay: false,
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/v1/billing/refund-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/billing/refund-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockGetExistingForPayment.mockResolvedValue(null);
    mockRequestRefund.mockResolvedValue(createdRefund);
  });

  it('retorna 401 quando requireAuth rejeita a chamada', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Não autorizado.', message: null }, { status: 401 }),
    );

    const res = await POST(request({ paymentId: 'pay-1', reason: 'Motivo' }));

    expect(res.status).toBe(401);
    expect(mockRequestRefund).not.toHaveBeenCalled();
  });

  it('retorna 400 para payload inválido', async () => {
    const res = await POST(request({ paymentId: 'pay-1', reason: '' }));

    expect(res.status).toBe(400);
    expect(mockRequestRefund).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe('Dados inválidos.');
  });

  it('cria pedido e retorna 201', async () => {
    const res = await POST(request({ paymentId: 'pay-1', reason: 'Motivo do aluno' }));

    expect(res.status).toBe(201);
    expect(mockRequestRefund).toHaveBeenCalledWith({
      userId: 'user-1',
      paymentId: 'pay-1',
      reason: 'Motivo do aluno',
    });

    const body = await res.json();
    expect(body.data).toEqual(createdRefund);
    expect(body.message).toBe('Pedido de reembolso registrado com sucesso.');
  });

  it('retorna 200 quando o pedido já existe para paymentId + userId', async () => {
    mockRequestRefund.mockResolvedValue({
      ...createdRefund,
      idempotentReplay: true,
    });

    const res = await POST(request({ paymentId: 'pay-1', reason: 'Motivo do aluno' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.idempotentReplay).toBe(true);
    expect(body.message).toBe('Pedido de reembolso já registrado anteriormente.');
  });

  it('traduz erros de domínio para status e code', async () => {
    mockRequestRefund.mockRejectedValue(
      new AppError('PAYMENT_072', 'Pagamento não elegível para pedido de reembolso.', 409),
    );

    const res = await POST(request({ paymentId: 'pay-1', reason: 'Motivo do aluno' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      data: null,
      error: 'Pagamento não elegível para pedido de reembolso.',
      code: 'PAYMENT_072',
    });
  });
});

describe('GET /api/v1/billing/refund-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockGetExistingForPayment.mockResolvedValue(createdRefund.refundRequest);
  });

  it('consulta pedido existente por paymentId escopado ao usuário autenticado', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/v1/billing/refund-requests?paymentId=pay-1'),
    );

    expect(res.status).toBe(200);
    expect(mockGetExistingForPayment).toHaveBeenCalledWith('user-1', 'pay-1');

    const body = await res.json();
    expect(body.data.refundRequest).toEqual(createdRefund.refundRequest);
  });

  it('retorna 400 sem paymentId', async () => {
    const res = await GET(new NextRequest('http://localhost/api/v1/billing/refund-requests'));

    expect(res.status).toBe(400);
    expect(mockGetExistingForPayment).not.toHaveBeenCalled();
  });
});
