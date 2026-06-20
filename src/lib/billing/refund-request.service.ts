import { PaymentStatus, RefundRequestStatus } from '@/lib/constants/enums';
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export interface RefundRequestDTO {
  id: string;
  paymentId: string;
  userId: string;
  reason: string;
  status: RefundRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRefundInput {
  userId: string;
  paymentId: string;
  reason: string;
}

export interface RequestRefundResult {
  refundRequest: RefundRequestDTO;
  idempotentReplay: boolean;
}

interface PaymentRecord {
  id: string;
  userId: string;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
}

interface RefundRequestRecord {
  id: string;
  paymentId: string;
  userId: string;
  reason: string;
  status: RefundRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface RefundRequestDelegate {
  findFirst(args: {
    where: { paymentId: string; userId: string };
    select: typeof REFUND_REQUEST_SELECT;
  }): Promise<RefundRequestRecord | null>;
  create(args: {
    data: {
      paymentId: string;
      userId: string;
      reason: string;
      status: RefundRequestStatus;
    };
    select: typeof REFUND_REQUEST_SELECT;
  }): Promise<RefundRequestRecord>;
}

interface RefundRequestDb {
  payment: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: {
        id: true;
        userId: true;
        status: true;
        stripePaymentIntentId: true;
      };
    }): Promise<PaymentRecord | null>;
  };
  refundRequest: RefundRequestDelegate;
}

const REFUND_REQUEST_SELECT = {
  id: true,
  paymentId: true,
  userId: true,
  reason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDTO(record: RefundRequestRecord): RefundRequestDTO {
  return {
    id: record.id,
    paymentId: record.paymentId,
    userId: record.userId,
    reason: record.reason,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export class RefundRequestService {
  constructor(private readonly db: RefundRequestDb = prisma as unknown as RefundRequestDb) {}

  async getExistingForPayment(userId: string, paymentId: string): Promise<RefundRequestDTO | null> {
    if (!paymentId.trim()) {
      throw new AppError('PAYMENT_068', 'Pagamento é obrigatório.', 400);
    }

    const existing = await this.findExisting(paymentId, userId);
    return existing ? toDTO(existing) : null;
  }

  async requestRefund(input: RequestRefundInput): Promise<RequestRefundResult> {
    const reason = input.reason.trim();

    if (!input.paymentId.trim()) {
      throw new AppError('PAYMENT_068', 'Pagamento é obrigatório.', 400);
    }

    if (!reason) {
      throw new AppError('PAYMENT_069', 'Motivo do reembolso é obrigatório.', 400);
    }

    const existing = await this.findExisting(input.paymentId, input.userId);
    if (existing) {
      return { refundRequest: toDTO(existing), idempotentReplay: true };
    }

    const payment = await this.db.payment.findFirst({
      where: { id: input.paymentId, userId: input.userId },
      select: {
        id: true,
        userId: true,
        status: true,
        stripePaymentIntentId: true,
      },
    });

    if (!payment) {
      throw new AppError('PAYMENT_066', 'Pagamento não encontrado.', 404);
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new AppError('PAYMENT_072', 'Pagamento não elegível para pedido de reembolso.', 409);
    }

    if (!payment.stripePaymentIntentId?.trim()) {
      throw new AppError(
        'PAYMENT_073',
        'Pagamento sem PaymentIntent Stripe para análise de reembolso.',
        409,
      );
    }

    try {
      const created = await this.db.refundRequest.create({
        data: {
          paymentId: payment.id,
          userId: input.userId,
          reason,
          status: RefundRequestStatus.PENDING,
        },
        select: REFUND_REQUEST_SELECT,
      });

      return { refundRequest: toDTO(created), idempotentReplay: false };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.findExisting(input.paymentId, input.userId);
        if (replay) {
          return { refundRequest: toDTO(replay), idempotentReplay: true };
        }
      }

      throw error;
    }
  }

  private findExisting(paymentId: string, userId: string): Promise<RefundRequestRecord | null> {
    return this.db.refundRequest.findFirst({
      where: { paymentId, userId },
      select: REFUND_REQUEST_SELECT,
    });
  }
}

export const refundRequestService = new RefundRequestService();
