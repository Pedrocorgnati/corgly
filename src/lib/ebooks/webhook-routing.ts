import 'server-only';

import type Stripe from 'stripe';

import {
  EBOOK_WEBHOOK_EVENT_TYPES,
  type EbookWebhookEventType,
} from '@/lib/ebooks/webhook-config';
import type { EbookWebhookIgnoredReason } from '@/lib/ebooks/webhook-idempotency';

// Roteamento puro de eventos do webhook de ebooks (D-B8). Sem I/O, sem log e
// sem efeito colateral: o nucleo do webhook e quem registra ledger, escreve no
// pedido e dispara ports. A lista suportada e unicamente a de
// EBOOK_WEBHOOK_EVENT_TYPES (D-B11); `refund.created` e qualquer outro tipo
// termina em ignored(`unsupported_event`).

/** Acao derivada do evento; `ignored` carrega o motivo (D-B8). */
export type EbookWebhookAction =
  | {
      type: 'fulfill';
      checkoutSessionId: string;
      eventType: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded';
    }
  | { type: 'notify_async_failed'; checkoutSessionId: string }
  | { type: 'refund'; paymentIntentId: string; amountRefunded: number; full: boolean }
  | { type: 'dispute'; paymentIntentId: string; disputeId: string; disputeStatus: string }
  | { type: 'ignored'; reason: EbookWebhookIgnoredReason };

const SUPPORTED_EVENT_TYPES: ReadonlySet<string> = new Set<string>(EBOOK_WEBHOOK_EVENT_TYPES);

function isSupportedEventType(type: string): type is EbookWebhookEventType {
  return SUPPORTED_EVENT_TYPES.has(type);
}

/**
 * Normaliza `charge.payment_intent` e `dispute.payment_intent`
 * (`string | Stripe.PaymentIntent | null`): objeto expandido vira `.id` e
 * null/vazio vira null (ignored `no_payment_intent`).
 */
function toPaymentIntentId(value: string | Stripe.PaymentIntent | null): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (value !== null && typeof value.id === 'string' && value.id.length > 0) {
    return value.id;
  }
  return null;
}

/**
 * `checkout.session.completed` e `checkout.session.async_payment_succeeded`:
 * so entrega sessao de ebook (`metadata.kind`); a decisao de entregar apenas
 * com `payment_status !== 'unpaid'` e do port do item 006.
 */
function routeCheckoutSession(
  event: Stripe.Event,
  eventType: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded',
): EbookWebhookAction {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== 'ebook') {
    return { type: 'ignored', reason: 'not_ebook' };
  }
  return { type: 'fulfill', checkoutSessionId: session.id, eventType };
}

/**
 * Deriva a acao de um evento ja assinado. Funcao pura: mesma entrada devolve
 * mesma saida e o evento nao e mutado.
 */
export function routeEbookWebhookEvent(event: Stripe.Event): EbookWebhookAction {
  const eventType = event.type;

  // Tipo fora da lista (inclui `refund.created`) nao e suportado por este
  // endpoint: o nucleo grava IGNORED com o motivo.
  if (!isSupportedEventType(eventType)) {
    return { type: 'ignored', reason: 'unsupported_event' };
  }

  switch (eventType) {
    case 'checkout.session.completed':
      return routeCheckoutSession(event, eventType);
    case 'checkout.session.async_payment_succeeded':
      return routeCheckoutSession(event, eventType);
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind !== 'ebook') {
        return { type: 'ignored', reason: 'not_ebook' };
      }
      return { type: 'notify_async_failed', checkoutSessionId: session.id };
    }
    case 'charge.refunded': {
      // Charge nao herda a metadata do PaymentIntent: quem filtra ebook e a
      // busca do pedido (D-B9). `full` vem do flag `refunded` do charge.
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = toPaymentIntentId(charge.payment_intent);
      if (paymentIntentId === null) {
        return { type: 'ignored', reason: 'no_payment_intent' };
      }
      return {
        type: 'refund',
        paymentIntentId,
        amountRefunded: charge.amount_refunded,
        full: charge.refunded === true,
      };
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId = toPaymentIntentId(dispute.payment_intent);
      if (paymentIntentId === null) {
        return { type: 'ignored', reason: 'no_payment_intent' };
      }
      return {
        type: 'dispute',
        paymentIntentId,
        disputeId: dispute.id,
        disputeStatus: dispute.status,
      };
    }
  }
}
