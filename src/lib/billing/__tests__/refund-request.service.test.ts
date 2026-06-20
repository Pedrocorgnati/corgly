import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RefundRequestService } from '@/lib/billing/refund-request.service';
import { AppError } from '@/lib/errors';

const now = new Date('2026-06-18T12:00:00.000Z');

function refund(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rr-1',
    paymentId: 'pay-1',
    userId: 'user-1',
    reason: 'Quero cancelar a compra.',
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    userId: 'user-1',
    status: 'SUCCEEDED',
    stripePaymentIntentId: 'pi_123',
    ...overrides,
  };
}

function makeDb() {
  return {
    payment: {
      findFirst: vi.fn(),
    },
    refundRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

describe('RefundRequestService.requestRefund', () => {
  let db: ReturnType<typeof makeDb>;
  let service: RefundRequestService;

  beforeEach(() => {
    db = makeDb();
    service = new RefundRequestService(db);
    db.refundRequest.findFirst.mockResolvedValue(null);
    db.payment.findFirst.mockResolvedValue(payment());
    db.refundRequest.create.mockResolvedValue(refund());
  });

  it('cria pedido PENDING para pagamento próprio SUCCEEDED com PaymentIntent', async () => {
    const result = await service.requestRefund({
      userId: 'user-1',
      paymentId: 'pay-1',
      reason: '  Quero cancelar a compra.  ',
    });

    expect(result).toEqual({
      refundRequest: {
        id: 'rr-1',
        paymentId: 'pay-1',
        userId: 'user-1',
        reason: 'Quero cancelar a compra.',
        status: 'PENDING',
        createdAt: '2026-06-18T12:00:00.000Z',
        updatedAt: '2026-06-18T12:00:00.000Z',
      },
      idempotentReplay: false,
    });
    expect(db.refundRequest.create).toHaveBeenCalledWith({
      data: {
        paymentId: 'pay-1',
        userId: 'user-1',
        reason: 'Quero cancelar a compra.',
        status: 'PENDING',
      },
      select: expect.any(Object),
    });
  });

  it('rejeita motivo vazio sem criar pedido', async () => {
    await expect(
      service.requestRefund({ userId: 'user-1', paymentId: 'pay-1', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_069', status: 400 });

    expect(db.payment.findFirst).not.toHaveBeenCalled();
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });

  it('rejeita pagamento inexistente', async () => {
    db.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.requestRefund({ userId: 'user-1', paymentId: 'pay-404', reason: 'Motivo' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_066', status: 404 });
  });

  it('rejeita pagamento de outro aluno', async () => {
    db.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.requestRefund({ userId: 'user-1', paymentId: 'pay-1', reason: 'Motivo' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_066', status: 404 });

    expect(db.refundRequest.create).not.toHaveBeenCalled();
    expect(db.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 'pay-1', userId: 'user-1' },
      select: {
        id: true,
        userId: true,
        status: true,
        stripePaymentIntentId: true,
      },
    });
  });

  it.each(['PENDING', 'FAILED', 'REFUNDED'])(
    'rejeita pagamento com status %s',
    async (status) => {
      db.payment.findFirst.mockResolvedValue(payment({ status }));

      await expect(
        service.requestRefund({ userId: 'user-1', paymentId: 'pay-1', reason: 'Motivo' }),
      ).rejects.toMatchObject({ code: 'PAYMENT_072', status: 409 });

      expect(db.refundRequest.create).not.toHaveBeenCalled();
    },
  );

  it('rejeita pagamento sem PaymentIntent Stripe', async () => {
    db.payment.findFirst.mockResolvedValue(payment({ stripePaymentIntentId: ' ' }));

    await expect(
      service.requestRefund({ userId: 'user-1', paymentId: 'pay-1', reason: 'Motivo' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_073', status: 409 });
  });

  it('retorna pedido existente para duplicidade funcional', async () => {
    db.refundRequest.findFirst.mockResolvedValue(refund({ id: 'rr-existing' }));

    const result = await service.requestRefund({
      userId: 'user-1',
      paymentId: 'pay-1',
      reason: 'Motivo novo',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.refundRequest.id).toBe('rr-existing');
    expect(db.payment.findFirst).not.toHaveBeenCalled();
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });

  it('consulta pedido existente sem buscar Payment de outro usuário', async () => {
    db.refundRequest.findFirst.mockResolvedValue(refund({ id: 'rr-existing' }));

    const result = await service.getExistingForPayment('user-1', 'pay-1');

    expect(result?.id).toBe('rr-existing');
    expect(db.refundRequest.findFirst).toHaveBeenCalledWith({
      where: { paymentId: 'pay-1', userId: 'user-1' },
      select: expect.any(Object),
    });
    expect(db.payment.findFirst).not.toHaveBeenCalled();
  });

  it('trata colisão P2002 concorrente como replay', async () => {
    db.refundRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(refund({ id: 'rr-concurrent' }));
    db.refundRequest.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.requestRefund({
      userId: 'user-1',
      paymentId: 'pay-1',
      reason: 'Motivo',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.refundRequest.id).toBe('rr-concurrent');
  });

  it('propaga erro de banco que não é unicidade', async () => {
    db.refundRequest.create.mockRejectedValue(new AppError('DB_001', 'Falha', 500));

    await expect(
      service.requestRefund({ userId: 'user-1', paymentId: 'pay-1', reason: 'Motivo' }),
    ).rejects.toMatchObject({ code: 'DB_001' });
  });
});
