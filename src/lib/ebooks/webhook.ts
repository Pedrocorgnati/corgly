import 'server-only';

import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';

import { EBOOK_WEBHOOK_MAX_BODY_BYTES } from '@/lib/ebooks/webhook-config';
import {
  claimEbookWebhookEvent,
  markEbookWebhookFailed,
  markEbookWebhookIgnored,
  markEbookWebhookProcessed,
  type EbookWebhookIgnoredReason,
} from '@/lib/ebooks/webhook-idempotency';
import type { EbookWebhookPorts } from '@/lib/ebooks/webhook-ports';
import {
  applyEbookDispute,
  applyEbookRefund,
  type EbookRefundDisputeOutcome,
} from '@/lib/ebooks/webhook-refund-dispute';
import { routeEbookWebhookEvent, type EbookWebhookAction } from '@/lib/ebooks/webhook-routing';

/**
 * Nucleo do webhook de ebooks (D-B4, D-B5, D-B7).
 *
 * Contrato:
 * - A rota so faz rate limit, le o corpo cru e mapeia o resultado em resposta;
 *   tudo o mais acontece aqui, sem request scope, para ser testavel.
 * - Sincrono: tamanho, segredo, assinatura, roteamento, claim no ledger e as
 *   escritas leves de reembolso/disputa. Pesado (fulfillment e notificacoes)
 *   vai para `deps.schedule` por um unico wrapper que marca PROCESSED/FAILED.
 * - Este modulo e o unico chamador das marcas do ledger.
 * - Logs com prefixo `[ebooks-webhook]` e somente id do evento, tipo, status do
 *   ledger e codigo de erro; nunca payload, email, token, segredo ou header
 *   de assinatura (D-B17).
 */

export type EbookWebhookDeps = {
  prisma: Pick<
    PrismaClient,
    'ebookWebhookEvent' | 'ebookOrder' | 'ebookAccessToken' | '$transaction'
  >;
  stripe: {
    webhooks: Pick<Stripe['webhooks'], 'constructEvent'>;
    paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve'>;
  };
  secret: string | undefined;
  ports: EbookWebhookPorts;
  schedule: (task: () => Promise<void>) => void;
  now: () => Date;
  config: { revokeOnRefund: boolean; revokeOnDispute: boolean };
};

export type EbookWebhookResult = { status: number; body: Record<string, unknown> };

const LOG_PREFIX = '[ebooks-webhook]';

const PROCESSING_FAILED: EbookWebhookResult = {
  status: 500,
  body: { error: 'processing_failed' },
};

function received(status: 'accepted' | 'duplicate' | 'ignored'): EbookWebhookResult {
  return { status: 200, body: { received: true, status } };
}

/** Codigo de erro seguro para log: `code` string, senao `name`, senao `unknown`. */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }
  }
  return 'unknown';
}

/** Mensagem do erro para o ledger; `markEbookWebhookFailed` sanitiza e trunca. */
function errorMessage(error: unknown): string {
  const code = errorCode(error);
  if (error instanceof Error && error.message.length > 0) {
    return `${code}: ${error.message}`;
  }
  return code;
}

/** Header com mais de um `t=` indica header duplicado concatenado (D-B3). */
function hasDuplicatedTimestamp(signature: string): boolean {
  return signature.split(',').filter((part) => part.trim().startsWith('t=')).length > 1;
}

function isOversized(rawBody: Buffer, contentLength: string | null): boolean {
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > EBOOK_WEBHOOK_MAX_BODY_BYTES) {
      return true;
    }
  }
  return rawBody.length > EBOOK_WEBHOOK_MAX_BODY_BYTES;
}

/** Sessao de checkout vai para a coluna do ledger; demais eventos gravam NULL. */
function checkoutSessionIdOf(action: EbookWebhookAction): string | null {
  if (action.type === 'fulfill' || action.type === 'notify_async_failed') {
    return action.checkoutSessionId;
  }
  return null;
}

/** Marca FAILED sem nunca lancar: falha da propria marca so vira log. */
async function markFailedSafely(
  event: Stripe.Event,
  error: unknown,
  deps: EbookWebhookDeps,
): Promise<void> {
  try {
    await markEbookWebhookFailed({ eventId: event.id, errorMessage: errorMessage(error) }, deps);
    console.error(`${LOG_PREFIX} evento falhou`, {
      eventId: event.id,
      type: event.type,
      status: 'FAILED',
      code: errorCode(error),
    });
  } catch (markError) {
    console.error(`${LOG_PREFIX} marca FAILED falhou`, {
      eventId: event.id,
      type: event.type,
      code: errorCode(markError),
    });
  }
}

/**
 * Unico ponto que chama `deps.schedule` (D-B7). A tarefa agendada marca
 * PROCESSED no fim ou FAILED no erro e nunca rejeita: a Stripe ja recebeu 2xx
 * e a recuperacao de FAILED e do script do item 008.
 */
function scheduleTracked(
  event: Stripe.Event,
  work: () => Promise<void>,
  deps: EbookWebhookDeps,
): void {
  deps.schedule(async () => {
    try {
      await work();
    } catch (error) {
      await markFailedSafely(event, error, deps);
      return;
    }

    try {
      await markEbookWebhookProcessed({ eventId: event.id }, deps);
      console.info(`${LOG_PREFIX} evento processado`, {
        eventId: event.id,
        type: event.type,
        status: 'PROCESSED',
      });
    } catch (markError) {
      // Trabalho concluido mas sem marca: a linha fica PROCESSING e o lease
      // vencido libera o reclaim (ports sao idempotentes por evento).
      console.error(`${LOG_PREFIX} marca PROCESSED falhou`, {
        eventId: event.id,
        type: event.type,
        code: errorCode(markError),
      });
    }
  });
}

async function markIgnoredAndRespond(
  event: Stripe.Event,
  reason: EbookWebhookIgnoredReason,
  deps: EbookWebhookDeps,
): Promise<EbookWebhookResult> {
  try {
    await markEbookWebhookIgnored({ eventId: event.id, reason }, deps);
  } catch (error) {
    await markFailedSafely(event, error, deps);
    return PROCESSING_FAILED;
  }
  console.info(`${LOG_PREFIX} evento ignorado`, {
    eventId: event.id,
    type: event.type,
    status: 'IGNORED',
  });
  return received('ignored');
}

/**
 * Reembolso e disputa: escrita leve sincrona (D-B9). `ignored` e
 * `unchanged` fecham o ledger aqui; `accepted` agenda a notificacao.
 */
async function handleRefundOrDispute(
  event: Stripe.Event,
  action: Extract<EbookWebhookAction, { type: 'refund' } | { type: 'dispute' }>,
  deps: EbookWebhookDeps,
): Promise<EbookWebhookResult> {
  let outcome: EbookRefundDisputeOutcome;
  try {
    outcome =
      action.type === 'refund'
        ? await applyEbookRefund(
            {
              paymentIntentId: action.paymentIntentId,
              amountRefunded: action.amountRefunded,
              full: action.full,
            },
            deps,
          )
        : await applyEbookDispute(
            {
              paymentIntentId: action.paymentIntentId,
              disputeId: action.disputeId,
              disputeStatus: action.disputeStatus,
            },
            deps,
          );
  } catch (error) {
    await markFailedSafely(event, error, deps);
    return PROCESSING_FAILED;
  }

  if (outcome.outcome === 'ignored') {
    return markIgnoredAndRespond(event, 'not_ebook', deps);
  }

  if (outcome.outcome === 'unchanged') {
    try {
      await markEbookWebhookProcessed({ eventId: event.id }, deps);
    } catch (error) {
      await markFailedSafely(event, error, deps);
      return PROCESSING_FAILED;
    }
    console.info(`${LOG_PREFIX} evento sem alteracao`, {
      eventId: event.id,
      type: event.type,
      status: 'PROCESSED',
    });
    return received('accepted');
  }

  const { orderId } = outcome;
  if (action.type === 'refund') {
    const full = action.full;
    scheduleTracked(
      event,
      () => deps.ports.notifyRefund({ orderId, eventId: event.id, full }),
      deps,
    );
  } else {
    scheduleTracked(event, () => deps.ports.notifyDispute({ orderId, eventId: event.id }), deps);
  }
  return received('accepted');
}

/**
 * Processa uma entrega do webhook de ebooks na ordem da tabela D-B5:
 * tamanho -> segredo -> header -> assinatura -> claim -> acao.
 */
export async function handleEbookWebhookRequest(
  input: { rawBody: Buffer; signature: string | null; contentLength: string | null },
  deps: EbookWebhookDeps,
): Promise<EbookWebhookResult> {
  if (isOversized(input.rawBody, input.contentLength)) {
    console.warn(`${LOG_PREFIX} corpo acima do limite`);
    return { status: 413, body: { error: 'payload_too_large' } };
  }

  if (!deps.secret) {
    console.error(`${LOG_PREFIX} STRIPE_EBOOKS_WEBHOOK_SECRET ausente`);
    return { status: 503, body: { error: 'webhook_not_configured' } };
  }

  if (!input.signature) {
    console.warn(`${LOG_PREFIX} header stripe-signature ausente`);
    return { status: 400, body: { error: 'missing_signature' } };
  }

  if (hasDuplicatedTimestamp(input.signature)) {
    console.warn(`${LOG_PREFIX} header stripe-signature duplicado`);
    return { status: 400, body: { error: 'invalid_signature_header' } };
  }

  let event: Stripe.Event;
  try {
    // Tolerancia default do SDK (300 s); nunca passar 0 (D-B3).
    event = deps.stripe.webhooks.constructEvent(input.rawBody, input.signature, deps.secret);
  } catch (error) {
    console.warn(`${LOG_PREFIX} assinatura invalida`, { code: errorCode(error) });
    return { status: 400, body: { error: 'Invalid signature.' } };
  }

  // Roteamento puro antes do claim so para gravar a sessao no ledger.
  const action = routeEbookWebhookEvent(event);

  let claim: Awaited<ReturnType<typeof claimEbookWebhookEvent>>;
  try {
    claim = await claimEbookWebhookEvent(
      { eventId: event.id, type: event.type, checkoutSessionId: checkoutSessionIdOf(action) },
      deps,
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} claim falhou`, {
      eventId: event.id,
      type: event.type,
      code: errorCode(error),
    });
    return PROCESSING_FAILED;
  }

  if (claim === 'duplicate') {
    console.info(`${LOG_PREFIX} evento duplicado`, {
      eventId: event.id,
      type: event.type,
      status: 'duplicate',
    });
    return received('duplicate');
  }

  if (claim === 'in_progress') {
    console.info(`${LOG_PREFIX} evento em processamento`, {
      eventId: event.id,
      type: event.type,
      status: 'in_progress',
    });
    return { status: 503, body: { status: 'in_progress' } };
  }

  switch (action.type) {
    case 'ignored':
      return markIgnoredAndRespond(event, action.reason, deps);
    case 'refund':
    case 'dispute':
      return handleRefundOrDispute(event, action, deps);
    case 'fulfill': {
      const { checkoutSessionId, eventType } = action;
      scheduleTracked(
        event,
        () => deps.ports.fulfillCheckoutSession({ checkoutSessionId, eventId: event.id, eventType }),
        deps,
      );
      break;
    }
    case 'notify_async_failed': {
      const { checkoutSessionId } = action;
      scheduleTracked(
        event,
        () => deps.ports.notifyAsyncPaymentFailed({ checkoutSessionId, eventId: event.id }),
        deps,
      );
      break;
    }
  }

  console.info(`${LOG_PREFIX} evento aceito`, {
    eventId: event.id,
    type: event.type,
    status: 'PROCESSING',
  });
  return received('accepted');
}
