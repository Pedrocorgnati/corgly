import 'server-only';

import { EbookWebhookPortNotReadyError } from '@/lib/ebooks/errors';
import {
  buildDefaultEbookFulfillmentDeps,
  createEbookFulfillmentPorts,
} from '@/lib/ebooks/fulfillment-ports';

/**
 * Contrato dos ports do webhook de ebooks (D-B12), implementado pelo item 006.
 *
 * Regras do contrato:
 * - Cada metodo e idempotente pela chave natural do recurso
 *   (`checkoutSessionId` ou `orderId`) combinada com `eventId`: a entrega e a
 *   notificacao repetidas do mesmo evento nao duplicam pedido, token nem email.
 * - O envio de email usa a Idempotency-Key do Resend com essa mesma chave.
 * - Em falha o metodo lanca excecao; o nucleo do webhook registra FAILED no
 *   ledger e o evento entra na recuperacao do item 008.
 * - Nenhum metodo loga email nem token de acesso (D-B17).
 * - `notifyDispute` nao constava do seed do item 006: registrado aqui para o
 *   item 006 implementa-lo junto dos demais (ver Notas do runbook).
 */
export interface EbookWebhookPorts {
  fulfillCheckoutSession(input: {
    checkoutSessionId: string;
    eventId: string;
    eventType: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded';
  }): Promise<void>;
  notifyAsyncPaymentFailed(input: { checkoutSessionId: string; eventId: string }): Promise<void>;
  notifyRefund(input: { orderId: string; eventId: string; full: boolean }): Promise<void>;
  notifyDispute(input: { orderId: string; eventId: string }): Promise<void>;
}

/**
 * Ports pendentes: todo port lanca `EbookWebhookPortNotReadyError('item-006')`,
 * virando FAILED registrado no ledger. Desde o item 006 nao e mais usado em
 * runtime (`getEbookWebhookPorts()` devolve as ports reais); segue exportado
 * como stub explicito para testes e para desligar o fulfillment se preciso.
 */
export const pendingEbookWebhookPorts: EbookWebhookPorts = {
  async fulfillCheckoutSession(): Promise<void> {
    throw new EbookWebhookPortNotReadyError('item-006');
  },
  async notifyAsyncPaymentFailed(): Promise<void> {
    throw new EbookWebhookPortNotReadyError('item-006');
  },
  async notifyRefund(): Promise<void> {
    throw new EbookWebhookPortNotReadyError('item-006');
  },
  async notifyDispute(): Promise<void> {
    throw new EbookWebhookPortNotReadyError('item-006');
  },
};

let realPorts: EbookWebhookPorts | null = null;

/**
 * Fonte unica dos ports usada pelo nucleo e pela rota: as ports reais do
 * fulfillment (item 006), montadas na primeira chamada e memorizadas. O import
 * deste modulo nao monta nada; se a montagem lancar, nada e memorizado e a
 * proxima chamada tenta de novo.
 */
export function getEbookWebhookPorts(): EbookWebhookPorts {
  if (realPorts === null) {
    realPorts = createEbookFulfillmentPorts(buildDefaultEbookFulfillmentDeps());
  }
  return realPorts;
}
