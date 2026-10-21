import 'server-only';

import type { EbookDeliveryEvent } from '@prisma/client';

import { logger } from '@/lib/logger';

import { renderEbookEmail, type EbookEmailKind } from './email-render';
import { EbookFulfillmentError } from './errors';
import {
  assertSendConfig,
  isUniqueViolation,
  readEbookSession,
  retrieveEbookCheckoutSession,
  sendEbookEmailWithRetry,
  truncateDetail,
  type EbookEmailSendOutcome,
  type EbookFulfillmentDeps,
} from './fulfillment';
import type { EbookCatalogEntry } from './schema';

/**
 * Notificacoes de falha assincrona, reembolso e disputa (item 006, D-C10).
 *
 * Idempotencia em duas camadas:
 * - evento `ok` em `EbookDeliveryEvent` bloqueia reenvio (por pedido no
 *   `async_failed`, por `eventId` no reembolso e na disputa);
 * - `Idempotency-Key` do Resend cobre a corrida entre duas chamadas.
 *
 * A comparacao por evento usa o primeiro token do `detail` por igualdade com
 * `event:{eventId}`, nunca por prefixo. Nenhuma notificacao emite token.
 */

export type EbookNotifyDeps = Pick<
  EbookFulfillmentDeps,
  'prisma' | 'stripe' | 'catalog' | 'priceIdFor' | 'email' | 'config' | 'sleep'
>;

export type EbookNotifyStatus = 'not_ebook' | 'sent' | 'already_sent' | 'skipped';

export interface EbookNotifyResult {
  status: EbookNotifyStatus;
  orderId?: string;
}

const LOG_PREFIX = '[ebooks-fulfillment]';
const EVENT_OK = 'ok';
const EVENT_REJECTED = 'rejected';

function eventToken(eventId: string): string {
  return `event:${eventId}`;
}

/** Primeiro token do `detail` (ate o primeiro espaco) igual a `event:{eventId}`. */
function detailMatchesEvent(detail: string | null, eventId: string): boolean {
  if (detail === null) return false;
  const space = detail.indexOf(' ');
  const first = space === -1 ? detail : detail.slice(0, space);
  return first === eventToken(eventId);
}

async function hasOkEventFor(
  prisma: EbookNotifyDeps['prisma'],
  orderId: string,
  event: string,
  eventId: string,
): Promise<boolean> {
  const rows: Pick<EbookDeliveryEvent, 'detail'>[] = await prisma.ebookDeliveryEvent.findMany({
    where: { orderId, event, result: EVENT_OK },
    select: { detail: true },
  });
  return rows.some((row) => detailMatchesEvent(row.detail, eventId));
}

async function requireOrder(prisma: EbookNotifyDeps['prisma'], orderId: string) {
  const order = await prisma.ebookOrder.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_ORDER_NOT_FOUND',
      `Pedido ${orderId} inexistente para a notificacao.`,
      { transient: false },
    );
  }
  return order;
}

function requireEntry(deps: EbookNotifyDeps, slug: string, orderId: string): EbookCatalogEntry {
  const entry = deps.catalog.getBySlug(slug);
  if (!entry) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_UNKNOWN_EBOOK',
      `Pedido ${orderId} aponta para ebook fora do catalogo.`,
      { transient: false },
    );
  }
  return entry;
}

/**
 * Envia a notificacao e grava o evento. `ok` grava `event:{id} resend:{id}`;
 * recusa permanente grava `rejected` e lanca EMAIL_REJECTED; transiente
 * esgotado lanca EMAIL_UNAVAILABLE sem gravar evento.
 */
async function sendNotification(
  params: {
    orderId: string;
    eventId: string;
    event: 'async_failed_email' | 'refund_email';
    kind: Extract<EbookEmailKind, 'async_failed' | 'refund_full' | 'refund_partial'>;
    entry: EbookCatalogEntry;
    to: string;
    idempotencyKey: string;
    retryUrl?: string;
  },
  deps: EbookNotifyDeps,
): Promise<void> {
  const { orderId, eventId, event, kind } = params;
  const rendered = renderEbookEmail({
    entry: params.entry,
    kind,
    links: params.retryUrl === undefined ? {} : { retryUrl: params.retryUrl },
  });
  const outcome: EbookEmailSendOutcome = await sendEbookEmailWithRetry(
    {
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: params.idempotencyKey,
    },
    deps,
  );

  if (outcome.ok) {
    await deps.prisma.ebookDeliveryEvent.create({
      data: {
        orderId,
        event,
        result: EVENT_OK,
        detail: truncateDetail(`${eventToken(eventId)} resend:${outcome.id}`),
      },
    });
    logger.info(`${LOG_PREFIX} notificacao aceita`, { orderId, eventId, kind });
    return;
  }

  const status = outcome.status === null ? (outcome.transient ? 'network' : 'unknown') : String(outcome.status);
  if (!outcome.transient) {
    await deps.prisma.ebookDeliveryEvent.create({
      data: {
        orderId,
        event,
        result: EVENT_REJECTED,
        detail: truncateDetail(`${eventToken(eventId)} status:${status}`),
      },
    });
    logger.warn(`${LOG_PREFIX} notificacao recusada pelo Resend`, { orderId, eventId, kind, status });
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_EMAIL_REJECTED',
      `Resend recusou a notificacao ${kind} do pedido ${orderId} (status ${status}).`,
      { transient: false },
    );
  }

  logger.warn(`${LOG_PREFIX} notificacao com transiente esgotado`, { orderId, eventId, kind, status });
  throw new EbookFulfillmentError(
    'EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE',
    `Resend indisponivel para a notificacao ${kind} do pedido ${orderId} (status ${status}).`,
    { transient: true },
  );
}

/**
 * `checkout.session.async_payment_failed`: pedido FAILED sem token e no maximo
 * um email `async_failed` por pedido (D-C10).
 */
export async function notifyEbookAsyncPaymentFailed(
  params: { checkoutSessionId: string; eventId: string },
  deps: EbookNotifyDeps,
): Promise<EbookNotifyResult> {
  const { checkoutSessionId, eventId } = params;
  const session = await retrieveEbookCheckoutSession(checkoutSessionId, deps);
  const read = readEbookSession(session, deps, { checkLineItemsAndAmount: false });
  if (read.kind === 'not_ebook') return { status: 'not_ebook' };

  let order: { id: string; paymentStatus: string; email: string };
  try {
    order = await deps.prisma.ebookOrder.create({
      data: { ...read.order, paymentStatus: 'FAILED' },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await deps.prisma.ebookOrder.findUnique({ where: { checkoutSessionId } });
    if (existing === null) throw err; // conflito em outra unique
    if (existing.paymentStatus === 'PENDING' || existing.paymentStatus === 'ASYNC_PENDING') {
      await deps.prisma.ebookOrder.updateMany({
        where: { id: existing.id, paymentStatus: { in: ['PENDING', 'ASYNC_PENDING'] } },
        data: { paymentStatus: 'FAILED' },
      });
    }
    order = (await requireOrder(deps.prisma, existing.id)) as typeof order;
  }

  // Pedido que nao terminou FAILED (pago, reembolsado, contestado) nunca recebe
  // o aviso de falha: o email contradiria o estado real do pagamento.
  if (order.paymentStatus !== 'FAILED') {
    logger.warn(`${LOG_PREFIX} falha assincrona ignorada: pedido fora de FAILED`, {
      orderId: order.id,
      eventId,
      paymentStatus: order.paymentStatus,
    });
    return { status: 'skipped', orderId: order.id };
  }

  // Idempotencia por pedido (intencional): qualquer async_failed_email ok bloqueia.
  const alreadySent = await deps.prisma.ebookDeliveryEvent.findFirst({
    where: { orderId: order.id, event: 'async_failed_email', result: EVENT_OK },
  });
  if (alreadySent !== null) return { status: 'already_sent', orderId: order.id };

  assertSendConfig(deps.config);
  const base = deps.config.appUrl.replace(/\/+$/, '');
  await sendNotification(
    {
      orderId: order.id,
      eventId,
      event: 'async_failed_email',
      kind: 'async_failed',
      entry: read.entry,
      to: order.email,
      idempotencyKey: `ebook-async-failed:${checkoutSessionId}`,
      retryUrl: `${base}/ebooks/${read.entry.slug}`,
    },
    deps,
  );
  return { status: 'sent', orderId: order.id };
}

/**
 * `charge.refunded`: aviso de reembolso total ou parcial, idempotente por
 * `eventId`. A revogacao do token ja foi feita por `applyEbookRefund`.
 */
export async function notifyEbookRefund(
  params: { orderId: string; eventId: string; full: boolean },
  deps: EbookNotifyDeps,
): Promise<EbookNotifyResult> {
  const { orderId, eventId, full } = params;
  const order = await requireOrder(deps.prisma, orderId);
  if (await hasOkEventFor(deps.prisma, orderId, 'refund_email', eventId)) {
    return { status: 'already_sent', orderId };
  }

  const entry = requireEntry(deps, order.slug, orderId);
  assertSendConfig(deps.config);
  await sendNotification(
    {
      orderId,
      eventId,
      event: 'refund_email',
      kind: full ? 'refund_full' : 'refund_partial',
      entry,
      to: order.email,
      idempotencyKey: `ebook-refund:${orderId}:${eventId}`,
    },
    deps,
  );
  return { status: 'sent', orderId };
}

/**
 * `charge.dispute.created`: so registra o evento (sem email ao comprador; a
 * contestacao corre no banco emissor). Idempotente por `eventId`.
 */
export async function recordEbookDispute(
  params: { orderId: string; eventId: string },
  deps: Pick<EbookNotifyDeps, 'prisma'>,
): Promise<EbookNotifyResult> {
  const { orderId, eventId } = params;
  await requireOrder(deps.prisma, orderId);
  if (await hasOkEventFor(deps.prisma, orderId, 'dispute_recorded', eventId)) {
    return { status: 'already_sent', orderId };
  }
  await deps.prisma.ebookDeliveryEvent.create({
    data: {
      orderId,
      event: 'dispute_recorded',
      result: EVENT_OK,
      detail: truncateDetail(eventToken(eventId)),
    },
  });
  logger.info(`${LOG_PREFIX} disputa registrada`, { orderId, eventId });
  return { status: 'sent', orderId };
}
