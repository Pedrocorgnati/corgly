import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  resolveEbookAccess,
  type EbookAccessDeps,
  type EbookAccessOrder,
  type EbookAccessResult,
} from './access';

// Desistencia do pedido (D8): leitura da tela pelo mesmo resolvedor do acesso
// (sem exigir PDF) e pedido de estorno idempotente com evento de entrega.

/** Janela de desistencia do pedido: 14 dias em milissegundos. */
export const EBOOK_WITHDRAWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type EbookWithdrawalStatus = 'accepted' | 'review' | 'expired' | 'error';

export const EBOOK_WITHDRAWAL_STATUSES: readonly EbookWithdrawalStatus[] = [
  'accepted',
  'review',
  'expired',
  'error',
];

export function isEbookWithdrawalStatus(value: unknown): value is EbookWithdrawalStatus {
  if (typeof value !== 'string') return false;
  const statuses: readonly string[] = EBOOK_WITHDRAWAL_STATUSES;
  return statuses.includes(value);
}

/** So leitura: resolveEbookAccess com requirePdf: false. */
export function getEbookWithdrawalView(
  deps: EbookAccessDeps,
  input: { token: string; ip: string; acceptLanguage: string | null | undefined },
): Promise<EbookAccessResult> {
  return resolveEbookAccess(deps, {
    token: input.token,
    ip: input.ip,
    acceptLanguage: input.acceptLanguage,
    requirePdf: false,
  });
}

export interface EbookWithdrawalDeps {
  prisma: Pick<PrismaClient, 'ebookDeliveryEvent' | 'ebookOrder'>;
  stripe: { refunds: Pick<Stripe['refunds'], 'create'> };
}

type EbookWithdrawalEventResult =
  | 'needs_review'
  | 'expired'
  | 'refund_requested'
  | 'refund_failed';

/** Grava o evento de entrega; detail so quando definido (exactOptionalPropertyTypes). */
async function recordWithdrawalEvent(
  deps: EbookWithdrawalDeps,
  orderId: string,
  result: EbookWithdrawalEventResult,
  detail?: string,
): Promise<void> {
  await deps.prisma.ebookDeliveryEvent.create({
    data: {
      orderId,
      event: 'withdrawal_requested',
      result,
      ...(detail === undefined ? {} : { detail }),
    },
  });
}

/**
 * Regras D8, nesta ordem: download iniciado -> review; janela vencida -> expired;
 * status de pagamento ou PI inadimplentes -> review; elegivel -> estorno idempotente.
 * Antes do estorno, firstDownloadAt e relido no banco: o pedido recebido veio da
 * leitura da tela e um download pode ter caido no meio (TOCTOU).
 * A revogacao do token fica com o webhook; este modulo nao revoga nada.
 */
export async function requestEbookWithdrawal(
  deps: EbookWithdrawalDeps,
  input: { order: EbookAccessOrder; now: Date },
): Promise<{ status: EbookWithdrawalStatus }> {
  const { order, now } = input;

  if (order.firstDownloadAt !== null) {
    await recordWithdrawalEvent(deps, order.id, 'needs_review', 'download_started');
    return { status: 'review' };
  }

  // HIPOTESE: a contagem dos 14 dias parte de createdAt do pedido.
  if (now.getTime() - order.createdAt.getTime() > EBOOK_WITHDRAWAL_WINDOW_MS) {
    await recordWithdrawalEvent(deps, order.id, 'expired');
    return { status: 'expired' };
  }

  if (order.paymentStatus !== 'PAID' || !order.stripePaymentIntentId) {
    await recordWithdrawalEvent(deps, order.id, 'needs_review', 'not_eligible');
    return { status: 'review' };
  }

  const current = await deps.prisma.ebookOrder.findUnique({
    where: { id: order.id },
    select: { firstDownloadAt: true },
  });
  if (!current) {
    await recordWithdrawalEvent(deps, order.id, 'needs_review', 'not_eligible');
    return { status: 'review' };
  }
  if (current.firstDownloadAt !== null) {
    await recordWithdrawalEvent(deps, order.id, 'needs_review', 'download_started');
    return { status: 'review' };
  }

  try {
    await deps.stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: { kind: 'ebook', reason: 'withdrawal' },
      },
      { idempotencyKey: 'ebook-withdrawal:' + order.id },
    );
  } catch (err) {
    // Nunca propaga a mensagem do gateway para evento, log ou resposta.
    await recordWithdrawalEvent(deps, order.id, 'refund_failed', 'gateway_error');
    logger.warn('[ebooks-withdrawal] estorno falhou', {
      orderId: order.id,
      type: (err as { type?: unknown }).type,
    });
    return { status: 'error' };
  }

  await recordWithdrawalEvent(deps, order.id, 'refund_requested');
  return { status: 'accepted' };
}
