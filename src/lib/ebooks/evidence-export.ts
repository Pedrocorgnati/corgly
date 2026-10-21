import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';

// Export de evidencia do pedido (A2): documento JSON unico para contestacao,
// com compra, eventos de entrega e acessos; nunca inclui tokenHash.

/** Teto do documento de evidencia em bytes UTF-8: 4.5 MB. */
export const EBOOK_EVIDENCE_MAX_BYTES = 4.5 * 1024 * 1024;

export type EbookEvidenceErrorCode =
  | 'EBOOK_EVIDENCE_ORDER_NOT_FOUND'
  | 'EBOOK_EVIDENCE_TOO_LARGE';

/** Falha do export de evidencia do pedido de ebook. */
export class EbookEvidenceError extends AppError {
  constructor(code: EbookEvidenceErrorCode, message: string) {
    super(code, message, 500);
    this.name = 'EbookEvidenceError';
  }
}

export type EbookEvidenceDeps = {
  prisma: Pick<
    PrismaClient,
    'ebookOrder' | 'ebookDeliveryEvent' | 'ebookAccessLog' | 'ebookAccessToken'
  >;
  now?: () => Date;
};

/** Data vira ISO UTC; nulo continua nulo, nunca omitido. */
function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Monta o documento de evidencia do pedido: order, deliveryEvents, accesses e
 * tokens (sem tokenHash), todo campo presente (nulo vindo como null) e toda
 * data em ISO UTC. Leituras ordenadas por createdAt/accessedAt asc com id asc
 * de desempate; amountTotal e refundedAmount sao Int no schema e viram number.
 * Acima de EBOOK_EVIDENCE_MAX_BYTES lanca EBOOK_EVIDENCE_TOO_LARGE sem truncar.
 */
export async function buildEbookOrderEvidence(
  input: { orderId: string },
  deps: EbookEvidenceDeps,
): Promise<{ json: string; bytes: number }> {
  const { orderId } = input;

  const order = await deps.prisma.ebookOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      checkoutSessionId: true,
      slug: true,
      locale: true,
      purchasedAt: true,
      amountTotal: true,
      currency: true,
      paymentStatus: true,
      deliveryStatus: true,
      billingCountry: true,
      cardCountry: true,
      email: true,
      withdrawalWaiverAt: true,
      withdrawalWaiverVersion: true,
      firstDownloadAt: true,
      refundedAt: true,
      refundedAmount: true,
      disputedAt: true,
      disputeId: true,
      disputeStatus: true,
    },
  });
  if (!order) {
    throw new EbookEvidenceError(
      'EBOOK_EVIDENCE_ORDER_NOT_FOUND',
      'Pedido de ebook nao encontrado para o export de evidencia.',
    );
  }

  // Ordem cronologica; o desempate por id garante estabilidade do documento.
  const deliveryEvents = await deps.prisma.ebookDeliveryEvent.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { event: true, result: true, detail: true, createdAt: true },
  });

  // EbookAccessLog liga ao pedido por orderId direto no schema.
  const accesses = await deps.prisma.ebookAccessLog.findMany({
    where: { orderId },
    orderBy: [{ accessedAt: 'asc' }, { id: 'asc' }],
    select: { accessedAt: true, ip: true },
  });

  // tokenHash nunca entra no select nem no documento.
  const tokens = await deps.prisma.ebookAccessToken.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { downloadCount: true, revokedAt: true, revokedReason: true },
  });

  const generatedAt = (deps.now === undefined ? new Date() : deps.now()).toISOString();

  const documento = {
    schemaVersion: 1,
    generatedAt,
    order: {
      id: order.id,
      checkoutSessionId: order.checkoutSessionId,
      slug: order.slug,
      locale: order.locale,
      purchasedAt: order.purchasedAt.toISOString(),
      amountTotal: order.amountTotal,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      billingCountry: order.billingCountry,
      cardCountry: order.cardCountry,
      email: order.email,
      withdrawalWaiverAt: toIsoOrNull(order.withdrawalWaiverAt),
      withdrawalWaiverVersion: order.withdrawalWaiverVersion,
      firstDownloadAt: toIsoOrNull(order.firstDownloadAt),
      refundedAt: toIsoOrNull(order.refundedAt),
      refundedAmount: order.refundedAmount,
      disputedAt: toIsoOrNull(order.disputedAt),
      disputeId: order.disputeId,
      disputeStatus: order.disputeStatus,
    },
    deliveryEvents: deliveryEvents.map((evento) => ({
      event: evento.event,
      result: evento.result,
      detail: evento.detail,
      createdAt: evento.createdAt.toISOString(),
    })),
    accesses: accesses.map((acesso) => ({
      accessedAt: acesso.accessedAt.toISOString(),
      ip: acesso.ip,
    })),
    tokens: tokens.map((token) => ({
      downloadCount: token.downloadCount,
      revokedAt: toIsoOrNull(token.revokedAt),
      revokedReason: token.revokedReason,
    })),
  };

  const json = JSON.stringify(documento, null, 2) + '\n';
  const bytes = Buffer.byteLength(json, 'utf8');

  // Nunca trunca: acima do teto o export falha fechado.
  if (bytes > EBOOK_EVIDENCE_MAX_BYTES) {
    throw new EbookEvidenceError(
      'EBOOK_EVIDENCE_TOO_LARGE',
      'Documento de evidencia excede o teto de bytes do export.',
    );
  }

  return { json, bytes };
}
