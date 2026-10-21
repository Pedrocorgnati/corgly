import 'server-only';

import { Prisma, type EbookOrder, type PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import {
  EbookEmailSendError,
  type EbookEmailMessage,
  type EbookEmailSender,
} from '@/services/ebook-email.service';

import { buildEbookAccessUrls, hashEbookAccessToken } from './access-token';
import { renderEbookEmail } from './email-render';
import { EbookFulfillmentError } from './errors';
import type { EbookCatalogEntry } from './schema';

/**
 * Nucleo do fulfillment de ebook (item 006, D-C3..D-C7 e D-C9).
 *
 * Contrato:
 * - A sessao Stripe e relida a cada chamada; validacoes falham com erro
 *   permanente ANTES de criar pedido.
 * - Concorrencia resolvida pela unique de `checkoutSessionId` e pelo claim
 *   condicional com lease, nunca por ler-depois-gravar.
 * - Status e evento de entrega gravam juntos na mesma `$transaction`; count 0
 *   no update condicional aborta a transacao e o estado e relido.
 * - O token cru existe so em memoria ate o envio; o banco guarda o hash.
 * - O resultado nunca carrega token, link nem email.
 * - Logs com prefixo `[ebooks-fulfillment]` e so ids, codigo, status e estado.
 */

export const EBOOK_DELIVERY_LEASE_MS = 5 * 60 * 1000;
export const EBOOK_FULFILLMENT_STRIPE_TIMEOUT_MS = 10_000;
export const EBOOK_EMAIL_SEND_ATTEMPTS = 3;
export const EBOOK_EMAIL_RETRY_BASE_MS = 500;

export type EbookFulfillmentTrigger = 'webhook' | 'success_page' | 'recovery';

export type EbookFulfillmentStatus =
  | 'not_ebook'
  | 'pending_payment'
  | 'failed_payment'
  | 'revoked'
  | 'in_progress'
  | 'accepted'
  | 'delivered'
  | 'needs_review';

export interface EbookFulfillmentResult {
  status: EbookFulfillmentStatus;
  orderId?: string;
}

export interface EbookFulfillmentDeps {
  prisma: Pick<PrismaClient, 'ebookOrder' | 'ebookAccessToken' | 'ebookDeliveryEvent' | '$transaction'>;
  stripe: { checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'retrieve'> } };
  catalog: { getBySlug(slug: string): EbookCatalogEntry | undefined };
  /** Price ID esperado; undefined ou '' = nao conferir `price.id`. */
  priceIdFor(entry: EbookCatalogEntry): string | undefined;
  email: Pick<EbookEmailSender, 'send' | 'getState'>;
  /** Strings possivelmente vazias: conferidas so no pre-envio (D-C5 passo 2). */
  config: { resendApiKey: string; emailFrom: string; appUrl: string };
  /** Lanca EbookFulfillmentError (PDF_UNAVAILABLE perm/trans ou CONFIG_MISSING trans). */
  checkPdf(entry: EbookCatalogEntry): Promise<void>;
  now(): Date;
  sleep(ms: number): Promise<void>;
  randomUUID(): string;
  generateToken(): string;
}

/** Colunas do `ebookOrder.create` lidas da sessao (alem de `paymentStatus`). */
export interface EbookSessionOrderData {
  checkoutSessionId: string;
  stripePaymentIntentId: string | null;
  slug: string;
  email: string;
  locale: string;
  amountTotal: number;
  currency: string;
  purchasedAt: Date;
  billingCountry: string | null;
  cardCountry: string | null;
  withdrawalWaiverAt: Date | null;
  withdrawalWaiverVersion: string | null;
}

export type EbookSessionRead =
  | { kind: 'not_ebook' }
  | { kind: 'ebook'; entry: EbookCatalogEntry; order: EbookSessionOrderData; payable: boolean };

export type EbookEmailSendOutcome =
  | { ok: true; id: string }
  | { ok: false; transient: true; status: number | null }
  | { ok: false; transient: false; status: number | null };

const LOG_PREFIX = '[ebooks-fulfillment]';
const DETAIL_MAX_CHARS = 500;

/** Claim perdido dentro de uma transacao: aborta (rollback) e o estado e relido. */
class EbookClaimLostError extends Error {
  constructor() {
    super('claim de entrega perdido');
    this.name = 'EbookClaimLostError';
  }
}

/** Compartilhado com `fulfillment-notify.ts`: `detail` cabe em VarChar(500). */
export function truncateDetail(detail: string): string {
  return detail.length > DETAIL_MAX_CHARS ? detail.slice(0, DETAIL_MAX_CHARS) : detail;
}

export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Leitura da sessao (D-C3)
// ---------------------------------------------------------------------------

/**
 * Le a sessao com o expand de D-C3. Nunca relanca o erro cru do Stripe: a
 * mensagem carrega so tipo, status HTTP e codigo.
 */
export async function retrieveEbookCheckoutSession(
  checkoutSessionId: string,
  deps: Pick<EbookFulfillmentDeps, 'stripe'>,
): Promise<Stripe.Checkout.Session> {
  try {
    return await deps.stripe.checkout.sessions.retrieve(
      checkoutSessionId,
      { expand: ['line_items', 'payment_intent.latest_charge'] },
      { timeout: EBOOK_FULFILLMENT_STRIPE_TIMEOUT_MS },
    );
  } catch (err) {
    throw mapStripeRetrieveError(err);
  }
}

function mapStripeRetrieveError(err: unknown): EbookFulfillmentError {
  if (err instanceof Stripe.errors.StripeError) {
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : null;
    const summary = `${err.type} status ${statusCode ?? 'n/a'} code ${err.code ?? 'n/a'}`;
    const transient =
      err instanceof Stripe.errors.StripeConnectionError ||
      err instanceof Stripe.errors.StripeAPIError ||
      err instanceof Stripe.errors.StripeRateLimitError ||
      (statusCode !== null && statusCode >= 500);
    if (transient) {
      return new EbookFulfillmentError(
        'EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE',
        `Stripe indisponivel ao ler a sessao (${summary}).`,
        { transient: true },
      );
    }
    if (err.code === 'resource_missing' || statusCode === 404) {
      return new EbookFulfillmentError(
        'EBOOK_FULFILLMENT_SESSION_NOT_FOUND',
        `Sessao de checkout nao encontrada no Stripe (${summary}).`,
        { transient: false },
      );
    }
    return new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE',
      `Stripe recusou a leitura da sessao (${summary}).`,
      { transient: false },
    );
  }
  const kind = err instanceof Error && err.name ? err.name : 'erro desconhecido';
  return new EbookFulfillmentError(
    'EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE',
    `Falha desconhecida ao ler a sessao (${kind}).`,
    { transient: false },
  );
}

function normalizeCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

function readPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (typeof pi === 'string') return pi;
  if (pi && typeof pi.id === 'string') return pi.id;
  return null;
}

function readCardCountry(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi || typeof pi === 'string') return null;
  const charge = pi.latest_charge;
  if (!charge || typeof charge === 'string') return null;
  return normalizeCountry(charge.payment_method_details?.card?.country);
}

function readBuyerEmail(session: Stripe.Checkout.Session): string | null {
  const candidates = [session.customer_details?.email, session.customer_email];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const trimmed = candidate.trim();
      return trimmed.includes('@') ? trimmed : null;
    }
  }
  return null;
}

function readWaiverAt(raw: string | undefined): Date | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertLineItems(
  session: Stripe.Checkout.Session,
  expectedPriceId: string | undefined,
  checkoutSessionId: string,
): void {
  const items = session.line_items?.data;
  const mismatch = (reason: string): EbookFulfillmentError =>
    new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_LINE_ITEMS_MISMATCH',
      `Itens da sessao ${checkoutSessionId} divergem do catalogo (${reason}).`,
      { transient: false },
    );

  if (!Array.isArray(items) || items.length !== 1) throw mismatch('quantidade de itens');
  const [item] = items;
  if (!item || item.quantity !== 1) throw mismatch('quantity');
  if (expectedPriceId && item.price?.id !== expectedPriceId) throw mismatch('price');
}

/**
 * Valida a sessao na ordem de D-C3 e extrai as colunas do pedido.
 * `checkLineItemsAndAmount=false` (notificacao de falha assincrona) pula as
 * guardas de itens e valor e usa valor/moeda da propria sessao.
 */
export function readEbookSession(
  session: Stripe.Checkout.Session,
  deps: Pick<EbookFulfillmentDeps, 'catalog' | 'priceIdFor'>,
  options: { checkLineItemsAndAmount: boolean },
): EbookSessionRead {
  const metadata = session.metadata ?? {};
  if (metadata.kind !== 'ebook') return { kind: 'not_ebook' };

  const checkoutSessionId = session.id;
  const slug = metadata.ebook_slug;
  const entry = typeof slug === 'string' && slug !== '' ? deps.catalog.getBySlug(slug) : undefined;
  if (!entry) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_UNKNOWN_EBOOK',
      `Sessao ${checkoutSessionId} aponta para ebook fora do catalogo.`,
      { transient: false },
    );
  }

  let amountTotal: number;
  let currency: string;
  if (options.checkLineItemsAndAmount) {
    assertLineItems(session, deps.priceIdFor(entry), checkoutSessionId);
    if (session.amount_total !== entry.unitAmount || session.currency !== entry.currency) {
      throw new EbookFulfillmentError(
        'EBOOK_FULFILLMENT_AMOUNT_MISMATCH',
        `Valor ou moeda da sessao ${checkoutSessionId} divergem do catalogo.`,
        { transient: false },
      );
    }
    amountTotal = entry.unitAmount;
    currency = entry.currency;
  } else {
    amountTotal = session.amount_total ?? 0;
    currency = session.currency ?? entry.currency;
  }

  const email = readBuyerEmail(session);
  if (email === null) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_BUYER_EMAIL_MISSING',
      `Sessao ${checkoutSessionId} sem email de comprador valido.`,
      { transient: false },
    );
  }

  const waiverVersion = metadata.withdrawal_waiver_version;

  return {
    kind: 'ebook',
    entry,
    payable: session.payment_status === 'paid' || session.payment_status === 'no_payment_required',
    order: {
      checkoutSessionId,
      stripePaymentIntentId: readPaymentIntentId(session),
      slug: entry.slug,
      email,
      locale: entry.locale,
      amountTotal,
      currency,
      purchasedAt: new Date(session.created * 1000),
      billingCountry: normalizeCountry(session.customer_details?.address?.country),
      cardCountry: readCardCountry(session),
      withdrawalWaiverAt: readWaiverAt(metadata.withdrawal_waiver_at),
      withdrawalWaiverVersion:
        typeof waiverVersion === 'string' && waiverVersion !== '' ? waiverVersion : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Envio com retentativa (D-C5 passo 4)
// ---------------------------------------------------------------------------

/**
 * Ate EBOOK_EMAIL_SEND_ATTEMPTS tentativas com a mesma mensagem (mesma
 * Idempotency-Key). Espera so entre tentativas e so em erro transiente.
 */
export async function sendEbookEmailWithRetry(
  message: EbookEmailMessage,
  deps: Pick<EbookFulfillmentDeps, 'email' | 'sleep'>,
): Promise<EbookEmailSendOutcome> {
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= EBOOK_EMAIL_SEND_ATTEMPTS; attempt += 1) {
    try {
      const { id } = await deps.email.send(message);
      return { ok: true, id };
    } catch (err) {
      if (err instanceof EbookEmailSendError && !err.transient) {
        return { ok: false, transient: false, status: err.status };
      }
      lastStatus = err instanceof EbookEmailSendError ? err.status : null;
    }
    if (attempt < EBOOK_EMAIL_SEND_ATTEMPTS) {
      await deps.sleep(EBOOK_EMAIL_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  return { ok: false, transient: true, status: lastStatus };
}

// ---------------------------------------------------------------------------
// Releitura de estado (D-C5 passo 1) e SENDING vencido (D-C6)
// ---------------------------------------------------------------------------

type EbookFulfillmentPrisma = EbookFulfillmentDeps['prisma'];

function mapStableDeliveryState(order: Pick<EbookOrder, 'deliveryStatus'>): EbookFulfillmentStatus {
  switch (order.deliveryStatus) {
    case 'ACCEPTED':
      return 'accepted';
    case 'DELIVERED':
      return 'delivered';
    case 'NEEDS_REVIEW':
      return 'needs_review';
    default:
      return 'in_progress';
  }
}

function isStaleSending(order: Pick<EbookOrder, 'deliveryStatus' | 'deliveryClaimedAt'>, cutoff: Date): boolean {
  return (
    order.deliveryStatus === 'SENDING' &&
    (order.deliveryClaimedAt === null || order.deliveryClaimedAt.getTime() < cutoff.getTime())
  );
}

/**
 * Tabela de releitura: nunca tenta claim de novo. SENDING vencido vai para
 * NEEDS_REVIEW (D-C6) sem reenvio.
 */
async function rereadState(
  orderId: string,
  deps: { prisma: EbookFulfillmentPrisma; now(): Date },
): Promise<EbookFulfillmentResult> {
  const order = await deps.prisma.ebookOrder.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_ORDER_NOT_FOUND',
      `Pedido ${orderId} sumiu durante o fulfillment.`,
      { transient: false },
    );
  }

  const cutoff = new Date(deps.now().getTime() - EBOOK_DELIVERY_LEASE_MS);
  if (isStaleSending(order, cutoff)) {
    return markStaleSendingForReview(order.id, order.deliveryClaimedAt, cutoff, deps.prisma);
  }
  return { status: mapStableDeliveryState(order), orderId };
}

async function markStaleSendingForReview(
  orderId: string,
  claimedAt: Date | null,
  cutoff: Date,
  prisma: EbookFulfillmentPrisma,
): Promise<EbookFulfillmentResult> {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const write = await tx.ebookOrder.updateMany({
        where: {
          id: orderId,
          deliveryStatus: 'SENDING',
          deliveryClaimedAt: claimedAt === null ? null : { lt: cutoff },
        },
        data: { deliveryStatus: 'NEEDS_REVIEW' },
      });
      if (write.count === 0) throw new EbookClaimLostError();
      await tx.ebookDeliveryEvent.create({
        data: { orderId, event: 'needs_review', result: 'delivery_outcome_unknown', detail: null },
      });
    });
  } catch (err) {
    if (!(err instanceof EbookClaimLostError)) throw err;
    // outro processo moveu o pedido: le uma vez, sem nova transicao nem recursao
    const order = await prisma.ebookOrder.findUnique({ where: { id: orderId } });
    if (order === null) {
      throw new EbookFulfillmentError(
        'EBOOK_FULFILLMENT_ORDER_NOT_FOUND',
        `Pedido ${orderId} sumiu durante o fulfillment.`,
        { transient: false },
      );
    }
    return { status: mapStableDeliveryState(order), orderId };
  }

  logger.warn(`${LOG_PREFIX} SENDING vencido movido para revisao`, {
    orderId,
    state: 'NEEDS_REVIEW',
  });
  return { status: 'needs_review', orderId };
}

/** Roda a transacao; claim perdido vira releitura pela tabela. */
async function runClaimedTransaction(
  orderId: string,
  deps: Pick<EbookFulfillmentDeps, 'prisma' | 'now'>,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
  logContext: Record<string, string>,
): Promise<EbookFulfillmentResult | null> {
  try {
    await deps.prisma.$transaction(work);
    return null;
  } catch (err) {
    if (!(err instanceof EbookClaimLostError)) throw err;
    logger.info(`${LOG_PREFIX} claim perdido; estado relido`, { ...logContext, orderId });
    return rereadState(orderId, deps);
  }
}

// ---------------------------------------------------------------------------
// Pedido e pagamento (D-C4)
// ---------------------------------------------------------------------------

async function upsertOrder(
  data: EbookSessionOrderData,
  payable: boolean,
  prisma: EbookFulfillmentPrisma,
): Promise<Pick<EbookOrder, 'id' | 'paymentStatus' | 'email'>> {
  try {
    const created = await prisma.ebookOrder.create({
      data: { ...data, paymentStatus: payable ? 'PAID' : 'ASYNC_PENDING' },
    });
    return created;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.ebookOrder.findUnique({
      where: { checkoutSessionId: data.checkoutSessionId },
    });
    if (existing === null) throw err; // conflito em outra unique

    if (
      payable &&
      (existing.paymentStatus === 'PENDING' || existing.paymentStatus === 'ASYNC_PENDING')
    ) {
      const write = await prisma.ebookOrder.updateMany({
        where: { id: existing.id, paymentStatus: { in: ['PENDING', 'ASYNC_PENDING'] } },
        data: { paymentStatus: 'PAID' },
      });
      if (write.count === 1) return { ...existing, paymentStatus: 'PAID' };
      const current = await prisma.ebookOrder.findUnique({ where: { id: existing.id } });
      if (current === null) {
        throw new EbookFulfillmentError(
          'EBOOK_FULFILLMENT_ORDER_NOT_FOUND',
          `Pedido ${existing.id} sumiu durante o fulfillment.`,
          { transient: false },
        );
      }
      return current;
    }
    return existing;
  }
}

// ---------------------------------------------------------------------------
// Pre-envio (D-C5 passo 2)
// ---------------------------------------------------------------------------

/** Compartilhado com `fulfillment-notify.ts`. */
export function assertSendConfig(config: EbookFulfillmentDeps['config']): void {
  const missing: string[] = [];
  if (config.resendApiKey.trim() === '') missing.push('RESEND_API_KEY');
  if (config.emailFrom.trim() === '') missing.push('EMAIL_FROM');
  if (config.appUrl.trim() === '') missing.push('NEXT_PUBLIC_APP_URL');
  if (missing.length > 0) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_CONFIG_MISSING',
      `Configuracao de envio ausente: ${missing.join(', ')}.`,
      { transient: true },
    );
  }
}

async function runPreSend(entry: EbookCatalogEntry, deps: EbookFulfillmentDeps): Promise<void> {
  try {
    await deps.checkPdf(entry);
  } catch (err) {
    if (err instanceof EbookFulfillmentError) throw err;
    const kind = err instanceof Error && err.name ? err.name : 'erro desconhecido';
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_PDF_UNAVAILABLE',
      `Falha inesperada ao conferir o PDF (${kind}).`,
      { transient: true },
    );
  }
  assertSendConfig(deps.config);
}

// ---------------------------------------------------------------------------
// Nucleo (D-C3..D-C7)
// ---------------------------------------------------------------------------

function paymentBlockedStatus(
  paymentStatus: EbookOrder['paymentStatus'],
): EbookFulfillmentStatus | null {
  switch (paymentStatus) {
    case 'PAID':
    case 'PARTIALLY_REFUNDED':
      return null;
    case 'REFUNDED':
    case 'DISPUTED':
      return 'revoked';
    case 'FAILED':
      return 'failed_payment';
    default:
      return 'pending_payment';
  }
}

/**
 * Le a sessao, garante o pedido e entrega o link permanente por email.
 * Erro transiente lanca (o webhook grava FAILED); NEEDS_REVIEW persistido
 * devolve resultado sem lancar.
 */
export async function fulfillEbookCheckoutSession(
  input: { checkoutSessionId: string; trigger: EbookFulfillmentTrigger },
  deps: EbookFulfillmentDeps,
): Promise<EbookFulfillmentResult> {
  const { checkoutSessionId, trigger } = input;
  const logContext = { checkoutSessionId, trigger };

  // a. sessao e validacoes (erro permanente antes de criar pedido)
  const session = await retrieveEbookCheckoutSession(checkoutSessionId, deps);
  const read = readEbookSession(session, deps, { checkLineItemsAndAmount: true });
  if (read.kind === 'not_ebook') return { status: 'not_ebook' };
  const { entry } = read;

  // b/c. pedido sob a unique e gate de pagamento
  const order = await upsertOrder(read.order, read.payable, deps.prisma);
  const orderId = order.id;
  if (!read.payable) {
    const blocked = paymentBlockedStatus(order.paymentStatus);
    return { status: blocked === null ? 'pending_payment' : blocked, orderId };
  }
  const blocked = paymentBlockedStatus(order.paymentStatus);
  if (blocked !== null) return { status: blocked, orderId };

  // d. claim condicional com lease
  const now = deps.now();
  const cutoff = new Date(now.getTime() - EBOOK_DELIVERY_LEASE_MS);
  const claimId = deps.randomUUID();
  const claim = await deps.prisma.ebookOrder.updateMany({
    where: {
      id: orderId,
      OR: [
        { deliveryStatus: 'PENDING' },
        { deliveryStatus: 'CLAIMED', deliveryClaimedAt: { lt: cutoff } },
      ],
    },
    data: {
      deliveryStatus: 'CLAIMED',
      deliveryClaimId: claimId,
      deliveryClaimedAt: now,
      deliveryAttempts: { increment: 1 },
    },
  });
  if (claim.count === 0) {
    logger.info(`${LOG_PREFIX} pedido ja reivindicado; estado relido`, { ...logContext, orderId });
    return rereadState(orderId, deps);
  }

  // e. pre-envio: PDF e configuracao, ainda CLAIMED e sem token
  try {
    await runPreSend(entry, deps);
  } catch (err) {
    const failure =
      err instanceof EbookFulfillmentError
        ? err
        : new EbookFulfillmentError('EBOOK_FULFILLMENT_PDF_UNAVAILABLE', 'Falha no pre-envio.', {
            transient: true,
          });

    if (failure.transient) {
      await deps.prisma.ebookOrder.updateMany({
        where: { id: orderId, deliveryClaimId: claimId },
        data: { deliveryStatus: 'PENDING', deliveryClaimId: null },
      });
      if (failure.code === 'EBOOK_FULFILLMENT_CONFIG_MISSING') {
        logger.error(`${LOG_PREFIX} configuracao de envio ausente; claim liberado`, {
          ...logContext,
          orderId,
          code: failure.code,
        });
      } else {
        logger.warn(`${LOG_PREFIX} pre-envio transiente; claim liberado`, {
          ...logContext,
          orderId,
          code: failure.code,
        });
      }
      throw failure;
    }

    const reread = await runClaimedTransaction(
      orderId,
      deps,
      async (tx) => {
        const write = await tx.ebookOrder.updateMany({
          where: { id: orderId, deliveryClaimId: claimId, deliveryStatus: 'CLAIMED' },
          data: { deliveryStatus: 'NEEDS_REVIEW' },
        });
        if (write.count === 0) throw new EbookClaimLostError();
        await tx.ebookDeliveryEvent.create({
          data: {
            orderId,
            event: 'needs_review',
            result: 'pdf_unavailable',
            detail: truncateDetail(failure.code),
          },
        });
      },
      logContext,
    );
    if (reread !== null) return reread;
    logger.warn(`${LOG_PREFIX} PDF indisponivel; pedido em revisao`, {
      ...logContext,
      orderId,
      code: failure.code,
      state: 'NEEDS_REVIEW',
    });
    return { status: 'needs_review', orderId };
  }

  // f. token (so o hash vai ao banco) + SENDING + evento, juntos
  const token = deps.generateToken();
  let tokenId = '';
  const tokenReread = await runClaimedTransaction(
    orderId,
    deps,
    async (tx) => {
      const created = await tx.ebookAccessToken.create({
        data: { orderId, tokenHash: hashEbookAccessToken(token) },
      });
      const write = await tx.ebookOrder.updateMany({
        where: { id: orderId, deliveryClaimId: claimId, deliveryStatus: 'CLAIMED' },
        data: { deliveryStatus: 'SENDING', deliveryClaimedAt: now },
      });
      if (write.count === 0) throw new EbookClaimLostError();
      await tx.ebookDeliveryEvent.create({
        data: { orderId, event: 'email_sending', result: 'ok', detail: null },
      });
      tokenId = created.id;
    },
    logContext,
  );
  if (tokenReread !== null) return tokenReread;

  // g. envio com a mesma Idempotency-Key em todas as tentativas
  const rendered = renderEbookEmail({
    entry,
    kind: 'delivery',
    links: buildEbookAccessUrls(token, deps.config.appUrl),
  });
  const outcome = await sendEbookEmailWithRetry(
    {
      to: order.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `ebook-delivery:${checkoutSessionId}`,
    },
    deps,
  );

  // h. aceito pelo Resend (nao significa entregue)
  if (outcome.ok) {
    const resendId = outcome.id;
    const reread = await runClaimedTransaction(
      orderId,
      deps,
      async (tx) => {
        const write = await tx.ebookOrder.updateMany({
          where: { id: orderId, deliveryClaimId: claimId, deliveryStatus: 'SENDING' },
          data: { deliveryStatus: 'ACCEPTED' },
        });
        if (write.count === 0) throw new EbookClaimLostError();
        await tx.ebookDeliveryEvent.create({
          data: {
            orderId,
            event: 'email_accepted',
            result: 'ok',
            detail: truncateDetail(`resend:${resendId}`),
          },
        });
      },
      logContext,
    );
    if (reread !== null) return reread;
    logger.info(`${LOG_PREFIX} email de entrega aceito`, {
      ...logContext,
      orderId,
      state: 'ACCEPTED',
    });
    return { status: 'accepted', orderId };
  }

  // i. recusa permanente: revisao + token revogado, juntos
  if (!outcome.transient) {
    const status = outcome.status;
    const reread = await runClaimedTransaction(
      orderId,
      deps,
      async (tx) => {
        const write = await tx.ebookOrder.updateMany({
          where: { id: orderId, deliveryClaimId: claimId, deliveryStatus: 'SENDING' },
          data: { deliveryStatus: 'NEEDS_REVIEW' },
        });
        if (write.count === 0) throw new EbookClaimLostError();
        await tx.ebookAccessToken.updateMany({
          where: { id: tokenId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'not_delivered' },
        });
        await tx.ebookDeliveryEvent.create({
          data: {
            orderId,
            event: 'needs_review',
            result: 'email_rejected',
            detail: truncateDetail(`status:${status ?? 'unknown'}`),
          },
        });
      },
      logContext,
    );
    if (reread !== null) return reread;
    logger.warn(`${LOG_PREFIX} email de entrega recusado; pedido em revisao`, {
      ...logContext,
      orderId,
      code: 'EBOOK_FULFILLMENT_EMAIL_REJECTED',
      status: status ?? 'unknown',
      state: 'NEEDS_REVIEW',
    });
    return { status: 'needs_review', orderId };
  }

  // j. transientes esgotados: pedido fica SENDING e o webhook grava FAILED
  await deps.prisma.ebookDeliveryEvent.create({
    data: {
      orderId,
      event: 'email_send_failed',
      result: 'transient',
      detail: truncateDetail(`status:${outcome.status ?? 'network'}`),
    },
  });
  logger.warn(`${LOG_PREFIX} envio transiente esgotado; pedido segue SENDING`, {
    ...logContext,
    orderId,
    code: 'EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE',
    status: outcome.status ?? 'network',
    state: 'SENDING',
  });
  throw new EbookFulfillmentError(
    'EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE',
    `Envio do email de entrega indisponivel apos ${EBOOK_EMAIL_SEND_ATTEMPTS} tentativas (status ${outcome.status ?? 'network'}).`,
    { transient: true },
  );
}

// ---------------------------------------------------------------------------
// Reconcile (D-C9)
// ---------------------------------------------------------------------------

const RESEND_DETAIL_PREFIX = 'resend:';

function readResendId(detail: string | null | undefined): string | null {
  if (typeof detail !== 'string' || !detail.startsWith(RESEND_DETAIL_PREFIX)) return null;
  const id = detail.slice(RESEND_DETAIL_PREFIX.length).split(' ')[0] ?? '';
  return id.trim() === '' ? null : id;
}

/**
 * Promove ACCEPTED para DELIVERED ou NEEDS_REVIEW conforme o `last_event` do
 * Resend. Nunca inventa estado final: erro do GET lanca sem mudar o pedido.
 */
export async function reconcileEbookDeliveryStatus(
  input: { orderId: string },
  deps: Pick<EbookFulfillmentDeps, 'prisma' | 'email' | 'now'>,
): Promise<EbookFulfillmentResult> {
  const { orderId } = input;
  const order = await deps.prisma.ebookOrder.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_ORDER_NOT_FOUND',
      `Pedido ${orderId} nao encontrado para reconcile.`,
      { transient: false },
    );
  }
  if (order.deliveryStatus !== 'ACCEPTED') {
    return { status: mapStableDeliveryState(order), orderId };
  }

  const transition = async (
    to: 'DELIVERED' | 'NEEDS_REVIEW',
    event: { event: string; result: string; detail: string | null },
  ): Promise<EbookFulfillmentResult> => {
    const reread = await runClaimedTransaction(
      orderId,
      deps,
      async (tx) => {
        const write = await tx.ebookOrder.updateMany({
          where: { id: orderId, deliveryStatus: 'ACCEPTED' },
          data: { deliveryStatus: to },
        });
        if (write.count === 0) throw new EbookClaimLostError();
        await tx.ebookDeliveryEvent.create({
          data: {
            orderId,
            event: event.event,
            result: event.result,
            detail: event.detail === null ? null : truncateDetail(event.detail),
          },
        });
      },
      { trigger: 'reconcile' },
    );
    if (reread !== null) return reread;
    if (to === 'NEEDS_REVIEW') {
      logger.warn(`${LOG_PREFIX} reconcile moveu o pedido para revisao`, {
        orderId,
        state: 'NEEDS_REVIEW',
        code: event.result,
      });
      return { status: 'needs_review', orderId };
    }
    logger.info(`${LOG_PREFIX} reconcile confirmou a entrega`, { orderId, state: 'DELIVERED' });
    return { status: 'delivered', orderId };
  };

  const accepted = await deps.prisma.ebookDeliveryEvent.findFirst({
    where: { orderId, event: 'email_accepted', result: 'ok' },
    orderBy: { createdAt: 'desc' },
  });
  const resendId = readResendId(accepted?.detail);
  if (resendId === null) {
    return transition('NEEDS_REVIEW', {
      event: 'needs_review',
      result: 'email_accepted_missing',
      detail: null,
    });
  }

  let state: Awaited<ReturnType<EbookFulfillmentDeps['email']['getState']>>;
  try {
    state = await deps.email.getState(resendId);
  } catch (err) {
    if (err instanceof EbookEmailSendError && !err.transient) {
      throw new EbookFulfillmentError(
        'EBOOK_FULFILLMENT_EMAIL_REJECTED',
        `Resend recusou a consulta do email (status ${err.status ?? 'n/a'}).`,
        { transient: false },
      );
    }
    const status = err instanceof EbookEmailSendError ? err.status : null;
    throw new EbookFulfillmentError(
      'EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE',
      `Resend indisponivel na consulta do email (status ${status ?? 'network'}).`,
      { transient: true },
    );
  }

  switch (state) {
    case 'delivered':
    case 'opened':
    case 'clicked':
      return transition('DELIVERED', {
        event: 'email_delivered',
        result: 'ok',
        detail: `${RESEND_DETAIL_PREFIX}${resendId}`,
      });
    case 'failed':
    case 'bounced':
    case 'suppressed':
    case 'complained':
      return transition('NEEDS_REVIEW', {
        event: 'needs_review',
        result: `email_${state}`,
        detail: `${RESEND_DETAIL_PREFIX}${resendId}`,
      });
    default:
      return { status: 'accepted', orderId };
  }
}

/** Intervalo minimo entre consultas ao Resend disparadas pela pagina de sucesso, por pedido. */
export const EBOOK_SUCCESS_RECONCILE_MIN_INTERVAL_MS = 5_000;
const SUCCESS_RECONCILE_TRACK_MAX = 500;
const lastSuccessReconcileAt = new Map<string, number>();

/**
 * Pagina de sucesso com pedido ACCEPTED: consulta o Resend (reconcile) para
 * promover a DELIVERED sem acao operacional. Throttle por pedido, em memoria do
 * processo, limita chamadas a API em reloads. Qualquer erro da consulta mantem
 * o resultado recebido (o pedido nao muda).
 */
export async function reconcileEbookDeliveryOnSuccessPage(
  result: EbookFulfillmentResult,
  deps: Pick<EbookFulfillmentDeps, 'prisma' | 'email' | 'now'>,
): Promise<EbookFulfillmentResult> {
  const { orderId } = result;
  if (result.status !== 'accepted' || orderId === undefined) return result;

  const nowMs = deps.now().getTime();
  const last = lastSuccessReconcileAt.get(orderId);
  if (last !== undefined && nowMs - last < EBOOK_SUCCESS_RECONCILE_MIN_INTERVAL_MS) return result;
  if (lastSuccessReconcileAt.size >= SUCCESS_RECONCILE_TRACK_MAX) {
    for (const [id, at] of lastSuccessReconcileAt) {
      if (nowMs - at >= EBOOK_SUCCESS_RECONCILE_MIN_INTERVAL_MS) lastSuccessReconcileAt.delete(id);
    }
    if (lastSuccessReconcileAt.size >= SUCCESS_RECONCILE_TRACK_MAX) lastSuccessReconcileAt.clear();
  }
  lastSuccessReconcileAt.set(orderId, nowMs);

  try {
    const reconciled = await reconcileEbookDeliveryStatus({ orderId }, deps);
    if (reconciled.status !== 'accepted') lastSuccessReconcileAt.delete(orderId);
    return reconciled;
  } catch (err) {
    logger.warn(`${LOG_PREFIX} reconcile da pagina de sucesso falhou; pedido segue ACCEPTED`, {
      orderId,
      trigger: 'success_page',
      code: err instanceof EbookFulfillmentError ? err.code : 'unknown',
    });
    return result;
  }
}

/** Uso exclusivo de teste: zera o throttle da pagina de sucesso. */
export function resetEbookSuccessReconcileThrottleForTests(): void {
  lastSuccessReconcileAt.clear();
}
