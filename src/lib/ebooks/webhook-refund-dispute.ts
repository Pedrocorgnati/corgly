import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';

import { EbookWebhookOrderPendingError } from '@/lib/ebooks/errors';

/**
 * Escritas sincronas de reembolso e disputa do webhook de ebooks (D-B9).
 *
 * Contrato:
 * - Pedido localizado por `stripePaymentIntentId`. Sem pedido, o Stripe decide
 *   se o pagamento e de ebook (`metadata.kind`): sem pedido para pagamento de
 *   ebook e fora de ordem e lanca `EbookWebhookOrderPendingError` (o nucleo
 *   marca FAILED e devolve 500 para a Stripe reentregar).
 * - Com pedido, a escrita roda em `prisma.$transaction`: reembolso e
 *   monotonico (`refundedAmount` so cresce) e disputa e idempotente
 *   (`disputeId` ja gravado nao muda nada).
 * - Revogacao de token so em reembolso total ou disputa, conforme
 *   `deps.config`; reembolso parcial nunca revoga.
 * - Este modulo nao agenda nada e nao marca o ledger: notificacao e marcas
 *   PROCESSED/FAILED sao do nucleo do webhook. Sem logs aqui (D-B17).
 */

export type EbookRefundDisputeOutcome =
  | { outcome: 'ignored' }
  | { outcome: 'unchanged'; orderId: string }
  | { outcome: 'accepted'; orderId: string };

/** Subconjunto compativel com o EbookWebhookDeps do nucleo (D-B4). */
export type EbookRefundDisputeDeps = {
  prisma: Pick<PrismaClient, 'ebookOrder' | 'ebookAccessToken' | '$transaction'>;
  stripe: { paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve'> };
  now: () => Date;
  config: { revokeOnRefund: boolean; revokeOnDispute: boolean };
};

/**
 * Sem pedido: pagamento que nao e de ebook vira `ignored`; pagamento de ebook
 * com pedido ainda nao criado (fora de ordem) lanca erro de pedido pendente.
 */
async function resolveWithoutOrder(
  paymentIntentId: string,
  deps: EbookRefundDisputeDeps,
): Promise<EbookRefundDisputeOutcome> {
  const paymentIntent = await deps.stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.metadata?.kind !== 'ebook') {
    return { outcome: 'ignored' };
  }
  throw new EbookWebhookOrderPendingError();
}

/**
 * Registra o reembolso no pedido e revoga o token em reembolso total.
 *
 * O `updateMany` monotonico devolve count 0 quando o valor gravado ja e maior
 * ou igual: reembolso repetido ou fora de ordem vira `unchanged`, sem revogar
 * e sem novo email (o nucleo marca PROCESSED de forma sincrona).
 */
export async function applyEbookRefund(
  input: { paymentIntentId: string; amountRefunded: number; full: boolean },
  deps: EbookRefundDisputeDeps,
): Promise<EbookRefundDisputeOutcome> {
  const now = deps.now();

  const order = await deps.prisma.ebookOrder.findUnique({
    where: { stripePaymentIntentId: input.paymentIntentId },
    select: { id: true, disputeId: true },
  });

  if (order === null) {
    return resolveWithoutOrder(input.paymentIntentId, deps);
  }

  const applied = await deps.prisma.$transaction(
    async (tx: Prisma.TransactionClient): Promise<boolean> => {
      const write = await tx.ebookOrder.updateMany({
        where: { id: order.id, refundedAmount: { lt: input.amountRefunded } },
        data: {
          refundedAmount: input.amountRefunded,
          refundedAt: now,
          paymentStatus: input.full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      if (write.count === 0) {
        return false;
      }

      if (input.full && deps.config.revokeOnRefund) {
        await tx.ebookAccessToken.updateMany({
          where: { orderId: order.id, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'refund' },
        });
      }

      return true;
    },
  );

  if (!applied) {
    return { outcome: 'unchanged', orderId: order.id };
  }
  return { outcome: 'accepted', orderId: order.id };
}

/**
 * Registra a disputa no pedido e revoga o token quando configurado.
 *
 * Disputa repetida com o mesmo `disputeId` devolve `unchanged` sem escrita; a
 * disputa grava `DISPUTED` em `paymentStatus` e o motivo `dispute` na revogacao.
 */
export async function applyEbookDispute(
  input: { paymentIntentId: string; disputeId: string; disputeStatus: string },
  deps: EbookRefundDisputeDeps,
): Promise<EbookRefundDisputeOutcome> {
  const now = deps.now();

  const order = await deps.prisma.ebookOrder.findUnique({
    where: { stripePaymentIntentId: input.paymentIntentId },
    select: { id: true, disputeId: true },
  });

  if (order === null) {
    return resolveWithoutOrder(input.paymentIntentId, deps);
  }

  if (order.disputeId === input.disputeId) {
    return { outcome: 'unchanged', orderId: order.id };
  }

  await deps.prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<void> => {
    await tx.ebookOrder.update({
      where: { id: order.id },
      data: {
        disputedAt: now,
        disputeId: input.disputeId,
        disputeStatus: input.disputeStatus,
        paymentStatus: 'DISPUTED',
      },
    });

    if (deps.config.revokeOnDispute) {
      await tx.ebookAccessToken.updateMany({
        where: { orderId: order.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'dispute' },
      });
    }
  });

  return { outcome: 'accepted', orderId: order.id };
}
