import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit/audit-logger';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { PaymentStatus, RefundRequestStatus } from '@/lib/constants/enums';
import {
  financialIdempotencyService,
  resolveRequestIdempotencyKey,
} from '@/lib/billing/idempotency.service';

export type RefundAdminDisplayStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'STRIPE_FAILURE';

interface RefundRequestRecord {
  id: string;
  paymentId: string;
  userId: string;
  reason: string;
  status: RefundRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  payment: {
    id: string;
    userId: string;
    status: PaymentStatus;
    stripePaymentIntentId: string | null;
    amount: number;
    currency: string;
  };
  user: {
    email: string;
  };
}

export interface RefundAdminItem {
  id: string;
  paymentId: string;
  userId: string;
  userEmail: string;
  studentReason: string;
  paymentAmount: number;
  paymentCurrency: string;
  requestStatus: RefundRequestStatus;
  displayStatus: RefundAdminDisplayStatus;
  displayMessage: string | null;
  idempotentReplay: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RefundAdminListResult {
  items: RefundAdminItem[];
  total: number;
}

export interface RefundAdminDecisionResult {
  item: RefundAdminItem;
  idempotentReplay: boolean;
}

export interface RefundLegacyResult {
  paymentId: string;
  refundId: string;
  amount: number;
  currency: string;
  status: string;
}

const AUDIT_ACTION_APPROVED = 'ADMIN_REFUND_APPROVED';
const AUDIT_ACTION_REJECTED = 'ADMIN_REFUND_REJECTED';
const AUDIT_ACTION_STRIPE_FAILED = 'ADMIN_REFUND_STRIPE_FAILED';
const ADMIN_REASON_MIN_LENGTH = 5;

function normalizeString(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha desconhecida no processamento do reembolso.';
}

function resolveDisplayStatus(
  requestStatus: RefundRequestStatus,
  lastAction?: string | null,
): RefundAdminDisplayStatus {
  if (requestStatus === RefundRequestStatus.APPROVED) {
    return 'APPROVED';
  }
  if (requestStatus === RefundRequestStatus.REJECTED) {
    return 'REJECTED';
  }
  if (requestStatus === RefundRequestStatus.STRIPE_FAILED) {
    return 'STRIPE_FAILURE';
  }
  if (lastAction === AUDIT_ACTION_STRIPE_FAILED) {
    return 'STRIPE_FAILURE';
  }
  return 'PENDING';
}

function resolveDisplayMessage(status: RefundAdminDisplayStatus, studentReason: string): string | null {
  if (status === 'APPROVED') return 'Reembolso aprovado e executado no Stripe.';
  if (status === 'REJECTED') return 'Reembolso negado pelo administrador.';
  if (status === 'STRIPE_FAILURE') return `Falha no processamento com Stripe para pedido: ${studentReason}`;
  return null;
}

function mapToItem(record: RefundRequestRecord, displayStatus: RefundAdminDisplayStatus): RefundAdminItem {
  return {
    id: record.id,
    paymentId: record.paymentId,
    userId: record.userId,
    userEmail: record.user.email,
    studentReason: record.reason,
    paymentAmount: record.payment.amount,
    paymentCurrency: record.payment.currency,
    requestStatus: record.status,
    displayStatus,
    displayMessage: resolveDisplayMessage(displayStatus, record.reason),
    idempotentReplay: false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function parseRefundAuditAction(action: string | null): string | null {
  return action === AUDIT_ACTION_APPROVED || action === AUDIT_ACTION_REJECTED || action === AUDIT_ACTION_STRIPE_FAILED
    ? action
    : null;
}

export class RefundAdminService {
  async listRefundRequests(statusFilter?: RefundRequestStatus): Promise<RefundAdminListResult> {
    const where = statusFilter ? { status: statusFilter } : {};

    const requests = await prisma.refundRequest.findMany({
      where,
      select: {
        id: true,
        paymentId: true,
        userId: true,
        reason: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        payment: {
          select: {
            id: true,
            userId: true,
            status: true,
            stripePaymentIntentId: true,
            amount: true,
            currency: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'RefundRequest',
        action: {
          in: [AUDIT_ACTION_APPROVED, AUDIT_ACTION_REJECTED, AUDIT_ACTION_STRIPE_FAILED],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        resourceId: true,
        action: true,
      },
    });

    const lastActionByRequest = new Map<string, string>();
    for (const log of logs) {
      const validAction = parseRefundAuditAction(log.action);
      if (validAction && !lastActionByRequest.has(log.resourceId)) {
        lastActionByRequest.set(log.resourceId, validAction);
      }
    }

    const items = requests.map((rawRequest) => {
      const request = rawRequest as unknown as RefundRequestRecord;
      const lastAction = lastActionByRequest.get(request.id);
      const displayStatus = resolveDisplayStatus(request.status, lastAction);
      return mapToItem(request, displayStatus);
    });

    return { items, total: items.length };
  }

  async decide(
    requestId: string,
    adminId: string,
    action: 'approve' | 'reject',
    reason: string,
    headers: Headers,
  ): Promise<RefundAdminDecisionResult> {
    const cleanedRequestId = normalizeString(requestId);
    const cleanedAdminId = normalizeString(adminId);
    const cleanedReason = normalizeString(reason);

    if (!cleanedAdminId) {
      throw new AppError('PAYMENT_002', 'Admin não informado.', 401);
    }
    if (!cleanedRequestId) {
      throw new AppError('PAYMENT_066', 'Solicitação não encontrada.', 404);
    }
    if (cleanedReason.length < ADMIN_REASON_MIN_LENGTH) {
      throw new AppError('PAYMENT_069', 'Motivo do administrador deve ter pelo menos 5 caracteres.', 400);
    }

    const request = await this.getRequestRecord(cleanedRequestId);
    if (!request) {
      throw new AppError('PAYMENT_066', 'Solicitação não encontrada.', 404);
    }

    if (request.status === RefundRequestStatus.APPROVED) {
      if (action === 'approve') {
        return {
          item: mapToItem(request, 'APPROVED'),
          idempotentReplay: true,
        };
      }
      throw new AppError('PAYMENT_074', 'A solicitação já foi aprovada e não pode ser rejeitada.', 409);
    }

    if (request.status === RefundRequestStatus.REJECTED) {
      if (action === 'reject') {
        return {
          item: mapToItem(request, 'REJECTED'),
          idempotentReplay: true,
        };
      }
      throw new AppError('PAYMENT_075', 'A solicitação já foi rejeitada e não pode ser aprovada.', 409);
    }

    if (action === 'reject') {
      const updated = await this.rejectRequest(request, cleanedAdminId, cleanedReason);

      if (updated.idempotentReplay) {
        return updated;
      }

      return {
        item: {
          ...updated.item,
          displayMessage: 'Reembolso negado pelo administrador.',
        },
        idempotentReplay: false,
      };
    }

    const idempotencyKey = resolveRequestIdempotencyKey(headers) ?? `refund-request-${request.id}`;
    const payload = {
      requestId: request.id,
      reason: cleanedReason,
      action,
    };

    let result: { refundId: string; amount: number; currency: string };
    let idempotentReplay: boolean;
    try {
      const idempotentResult = await financialIdempotencyService.run(
        'admin_refund',
        request.id,
        idempotencyKey,
        payload,
        (scopedIdempotencyKey) => this.approveRequest(cleanedRequestId, scopedIdempotencyKey),
      );
      result = idempotentResult.result;
      idempotentReplay = idempotentResult.idempotentReplay;
    } catch (error) {
      if (!(error instanceof AppError)) {
        await auditLog(
          AUDIT_ACTION_STRIPE_FAILED,
          { type: 'RefundRequest', id: request.id },
          cleanedAdminId,
          {
            paymentId: request.paymentId,
            userId: request.userId,
            adminReason: cleanedReason,
            error: describeFailure(error),
          },
        );
      }
      throw error;
    }

    const refreshed = await this.getRequestRecord(cleanedRequestId);
    if (!refreshed) {
      throw new AppError('PAYMENT_066', 'Solicitação não encontrada.', 404);
    }

    if (!idempotentReplay) {
      await auditLog(
        AUDIT_ACTION_APPROVED,
        { type: 'RefundRequest', id: request.id },
        cleanedAdminId,
        {
          paymentId: request.paymentId,
          userId: request.userId,
          adminReason: cleanedReason,
          stripeRefundId: result.refundId,
          stripeAmount: result.amount,
          stripeCurrency: result.currency,
        },
      );
    }

    return {
      item: {
        ...mapToItem(refreshed, 'APPROVED'),
        displayMessage: `Reembolso aprovado com sucesso (${result.amount} ${result.currency}).`,
      },
      idempotentReplay,
    };
  }

  async createPaymentRefund(
    paymentId: string,
    adminId: string,
    amount?: number,
    headers?: Headers,
  ): Promise<{ result: RefundLegacyResult; idempotentReplay: boolean }> {
    const cleanedAdminId = normalizeString(adminId);
    const cleanedPaymentId = normalizeString(paymentId);

    if (!cleanedAdminId) {
      throw new AppError('PAYMENT_002', 'Admin não informado.', 401);
    }
    if (!cleanedPaymentId) {
      throw new AppError('PAYMENT_068', 'Pagamento é obrigatório.', 400);
    }

    const payment = await prisma.payment.findUnique({
      where: { id: cleanedPaymentId },
      select: {
        id: true,
        stripePaymentIntentId: true,
        amount: true,
        currency: true,
        status: true,
      },
    });

    if (!payment) {
      throw new AppError('PAYMENT_066', 'Pagamento não encontrado.', 404);
    }
    if (payment.status === PaymentStatus.REFUNDED) {
      throw new AppError('PAYMENT_067', 'Pagamento já está reembolsado.', 409);
    }
    if (!payment.stripePaymentIntentId?.trim()) {
      throw new AppError('PAYMENT_073', 'Pagamento sem PaymentIntent Stripe para análise de reembolso.', 409);
    }

    const idempotencyKey = headers ? resolveRequestIdempotencyKey(headers) : null;
    const payload = { paymentId: payment.id, amount, adminId: cleanedAdminId };

    const idempotentResult = idempotencyKey
      ? await financialIdempotencyService.run(
          'admin_refund',
          cleanedAdminId,
          idempotencyKey,
          payload,
          (scopedIdempotencyKey) =>
            this.createLegacyStripeRefund(cleanedPaymentId, amount, scopedIdempotencyKey),
        )
      : { result: await this.createLegacyStripeRefund(cleanedPaymentId, amount), idempotentReplay: false };

    return idempotentResult;
  }

  private async approveRequest(
    requestId: string,
    idempotencyKey?: string | null,
  ): Promise<{ refundId: string; amount: number; currency: string }> {
    const request = await prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        paymentId: true,
        status: true,
        payment: {
          select: {
            status: true,
            stripePaymentIntentId: true,
            amount: true,
            currency: true,
          },
        },
      },
    });

    if (!request) {
      throw new AppError('PAYMENT_066', 'Solicitação não encontrada.', 404);
    }
    if (
      request.status !== RefundRequestStatus.PENDING &&
      request.status !== RefundRequestStatus.STRIPE_FAILED &&
      request.status !== RefundRequestStatus.STRIPE_PROCESSING
    ) {
      throw new AppError('PAYMENT_075', 'A solicitação não está pendente para aprovação.', 409);
    }
    if (!request.payment) {
      throw new AppError('PAYMENT_066', 'Pagamento não encontrado.', 404);
    }
    if (request.payment.status !== PaymentStatus.SUCCEEDED) {
      throw new AppError('PAYMENT_072', 'Pagamento não elegível para reembolso.', 409);
    }
    if (!request.payment.stripePaymentIntentId?.trim()) {
      throw new AppError('PAYMENT_073', 'Pagamento sem PaymentIntent Stripe para análise de reembolso.', 409);
    }

    const claim = await prisma.refundRequest.updateMany({
      where: {
        id: request.id,
        status: {
          in: [
            RefundRequestStatus.PENDING,
            RefundRequestStatus.STRIPE_FAILED,
            RefundRequestStatus.STRIPE_PROCESSING,
          ],
        },
      },
      data: { status: RefundRequestStatus.STRIPE_PROCESSING },
    });
    if (claim.count !== 1) {
      throw new AppError('PAYMENT_065', 'Operação financeira já está em processamento para esta solicitação.', 409);
    }

    let stripeRefund: { id: string; amount: number; currency?: string | null };
    try {
      const stripe = getStripe();
      stripeRefund = await stripe.refunds.create({
        payment_intent: request.payment.stripePaymentIntentId,
        amount: request.payment.amount,
        reason: 'requested_by_customer',
        metadata: {
          refundRequestId: request.id,
          paymentId: request.paymentId,
        },
      }, idempotencyKey ? { idempotencyKey } : undefined);

      await prisma.$transaction(async (tx) => {
        await tx.refundRequest.update({
          where: { id: request.id },
          data: { status: RefundRequestStatus.APPROVED },
        });
        await tx.payment.update({
          where: { id: request.paymentId },
          data: { status: PaymentStatus.REFUNDED },
        });
      });
    } catch (error) {
      await prisma.refundRequest.update({
        where: { id: request.id },
        data: { status: RefundRequestStatus.STRIPE_FAILED },
      });
      throw error;
    }

    return {
      refundId: stripeRefund.id,
      amount: stripeRefund.amount,
      currency: (stripeRefund.currency as string) ?? request.payment.currency,
    };
  }

  private async createLegacyStripeRefund(
    paymentId: string,
    amount?: number,
    idempotencyKey?: string | null,
  ): Promise<RefundLegacyResult> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        stripePaymentIntentId: true,
        amount: true,
        currency: true,
        status: true,
      },
    });

    if (!payment) {
      throw new AppError('PAYMENT_066', 'Pagamento não encontrado.', 404);
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new AppError('PAYMENT_072', 'Pagamento não elegível para reembolso.', 409);
    }

    if (!payment.stripePaymentIntentId?.trim()) {
      throw new AppError('PAYMENT_073', 'Pagamento sem PaymentIntent Stripe para análise de reembolso.', 409);
    }

    const stripe = getStripe();
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      ...(amount ? { amount } : {}),
      reason: 'requested_by_customer',
    }, idempotencyKey ? { idempotencyKey } : undefined);

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });

    return {
      paymentId: payment.id,
      refundId: stripeRefund.id,
      amount: (stripeRefund.amount as number) ?? payment.amount,
      currency: (stripeRefund.currency as string) ?? payment.currency,
      status: (stripeRefund.status as string) ?? 'succeeded',
    };
  }

  private async getRequestRecord(requestId: string): Promise<RefundRequestRecord | null> {
    const request = await prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        paymentId: true,
        userId: true,
        reason: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        payment: {
          select: {
            id: true,
            userId: true,
            status: true,
            stripePaymentIntentId: true,
            amount: true,
            currency: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return request ? (request as unknown as RefundRequestRecord) : null;
  }

  private async rejectRequest(
    request: RefundRequestRecord,
    adminId: string,
    adminReason: string,
  ): Promise<RefundAdminDecisionResult> {
    const updatedCount = await prisma.refundRequest.updateMany({
      where: { id: request.id, status: RefundRequestStatus.PENDING },
      data: { status: RefundRequestStatus.REJECTED },
    });

    if (updatedCount.count !== 1) {
      const refreshed = await this.getRequestRecord(request.id);
      if (refreshed?.status === RefundRequestStatus.REJECTED) {
        return { item: mapToItem(refreshed, 'REJECTED'), idempotentReplay: true };
      }
      throw new AppError('PAYMENT_075', 'A solicitação não está pendente para rejeição.', 409);
    }

    await auditLog(
      AUDIT_ACTION_REJECTED,
      { type: 'RefundRequest', id: request.id },
      adminId,
      {
        paymentId: request.paymentId,
        userId: request.userId,
        adminReason,
      },
    );

    const refreshed = await this.getRequestRecord(request.id);
    if (!refreshed) {
      throw new AppError('PAYMENT_066', 'Solicitação não encontrada.', 404);
    }

    return { item: mapToItem(refreshed, 'REJECTED'), idempotentReplay: false };
  }
}

export const refundAdminService = new RefundAdminService();
