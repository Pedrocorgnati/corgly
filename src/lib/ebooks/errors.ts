import 'server-only';

import { AppError } from '@/lib/errors';

/** Catalogo de ebooks invalido: entrada fora do schema ou unicidade violada. */
export class EbookCatalogError extends AppError {
  constructor(message: string) {
    super('EBOOK_CATALOG_INVALID', message, 500);
    this.name = 'EbookCatalogError';
  }
}

export type EbookConfigErrorCode =
  | 'EBOOK_PRIVATE_DIR_MISSING'
  | 'EBOOK_PRIVATE_DIR_NOT_ABSOLUTE';

/** Configuracao de runtime dos ebooks ausente ou invalida. */
export class EbookConfigError extends AppError {
  constructor(code: EbookConfigErrorCode, message: string) {
    super(code, message, 500);
    this.name = 'EbookConfigError';
  }
}

export type EbookCheckoutErrorCode =
  | 'EBOOK_CHECKOUT_UNSUPPORTED_MEDIA_TYPE'
  | 'EBOOK_CHECKOUT_ORIGIN_NOT_ALLOWED'
  | 'EBOOK_CHECKOUT_RATE_LIMITED'
  | 'EBOOK_CHECKOUT_PAYLOAD_TOO_LARGE'
  | 'EBOOK_CHECKOUT_INVALID_INPUT'
  | 'EBOOK_CHECKOUT_UNKNOWN_EBOOK'
  | 'EBOOK_CHECKOUT_UNAVAILABLE'
  | 'EBOOK_CHECKOUT_GATEWAY_ERROR'
  | 'EBOOK_CHECKOUT_GATEWAY_TIMEOUT'
  | 'EBOOK_CHECKOUT_METHOD_NOT_ALLOWED';

/** Falha do checkout de ebook com codigo e status fechados do contrato da rota. */
export class EbookCheckoutError extends AppError {
  constructor(code: EbookCheckoutErrorCode, message: string, status: number) {
    super(code, message, status);
    this.name = 'EbookCheckoutError';
  }
}

/** Port do webhook de ebooks ainda sem implementacao (pendente de item posterior). */
export class EbookWebhookPortNotReadyError extends AppError {
  constructor(pendingOn: string) {
    super(
      'EBOOK_WEBHOOK_PORT_NOT_READY',
      `Port do webhook de ebooks pendente (${pendingOn})`,
      500,
    );
    this.name = 'EbookWebhookPortNotReadyError';
  }
}

/** Reembolso/disputa de pagamento de ebook chegou antes da criacao do pedido. */
export class EbookWebhookOrderPendingError extends AppError {
  constructor() {
    super(
      'EBOOK_WEBHOOK_ORDER_PENDING',
      'Pedido de ebook ainda nao existe para este pagamento; evento sera reentregue.',
      500,
    );
    this.name = 'EbookWebhookOrderPendingError';
  }
}

export type EbookFulfillmentErrorCode =
  | 'EBOOK_FULFILLMENT_SESSION_NOT_FOUND'
  | 'EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE'
  | 'EBOOK_FULFILLMENT_UNKNOWN_EBOOK'
  | 'EBOOK_FULFILLMENT_LINE_ITEMS_MISMATCH'
  | 'EBOOK_FULFILLMENT_AMOUNT_MISMATCH'
  | 'EBOOK_FULFILLMENT_BUYER_EMAIL_MISSING'
  | 'EBOOK_FULFILLMENT_PDF_UNAVAILABLE'
  | 'EBOOK_FULFILLMENT_CONFIG_MISSING'
  | 'EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE'
  | 'EBOOK_FULFILLMENT_EMAIL_REJECTED'
  | 'EBOOK_FULFILLMENT_ORDER_NOT_FOUND';

/**
 * Falha do fulfillment de ebook. transient=true: webhook deve falhar (FAILED, reentrega/recuperacao).
 * transient=false: erro permanente do pedido, sem reprocessamento automatico.
 */
export class EbookFulfillmentError extends AppError {
  readonly transient: boolean;

  constructor(code: EbookFulfillmentErrorCode, message: string, options: { transient: boolean }) {
    super(code, message, 500);
    this.name = 'EbookFulfillmentError';
    this.transient = options.transient;
  }
}
