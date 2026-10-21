import 'server-only';

// Excecao a ADR-0006 (D-A14): o checkout de ebook nao usa a politica de moeda
// de `subscription-pricing.ts`; o preco e a moeda vem do Price one_time em USD
// do catalogo e sao conferidos pela guarda de Price (D-A3) antes da sessao.
// Sem idempotency key (D-A12): cada clique cria uma sessao nova, nada e
// gravado aqui, a sessao abandonada expira sozinha e a idempotencia de entrega
// mora no webhook do item 005.

import Stripe from 'stripe';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/stripe';

import { getEbookBySlug } from './catalog';
import { buildEbookCheckoutUrls } from './checkout-urls';
import { EbookCheckoutError } from './errors';
import type { EbookCatalogEntry } from './schema';

/** Versao do texto de consentimento de arrependimento gravado na metadata. */
export const EBOOK_WITHDRAWAL_WAIVER_VERSION = '2026-10-19.1';

/** Timeout (ms) aplicado como RequestOptions em toda chamada Stripe. */
export const EBOOK_CHECKOUT_STRIPE_TIMEOUT_MS = 10_000;

/** Descritor usado quando EBOOK_STATEMENT_DESCRIPTOR_SUFFIX nao esta definido. */
export const EBOOK_STATEMENT_DESCRIPTOR_DEFAULT = 'CORGLY';

const EBOOK_STATEMENT_DESCRIPTOR_ENV = 'EBOOK_STATEMENT_DESCRIPTOR_SUFFIX';

// Caracteres proibidos no descritor de extrato (D-A8).
const DESCRIPTOR_FORBIDDEN_CHARS = ['<', '>', '\\', "'", '"', '*'];

type PriceGuardField = 'active' | 'type' | 'unit_amount' | 'currency' | 'livemode';

/**
 * Modo Stripe pelo prefixo da chave secreta: `sk_live_` -> live, resto -> test
 * (D-A2). O modo decide qual nome de env do Price e lido.
 */
export function resolveStripeMode(secretKey: string): 'test' | 'live' {
  return secretKey.startsWith('sk_live_') ? 'live' : 'test';
}

/**
 * Descritor de extrato a partir da env global (D-A8). Ausente ou vazio ->
 * default; valido -> o valor exatamente como veio (sem trim); invalido -> null.
 */
export function resolveStatementDescriptorSuffix(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return EBOOK_STATEMENT_DESCRIPTOR_DEFAULT;

  const hasForbiddenChar = DESCRIPTOR_FORBIDDEN_CHARS.some((char) => raw.includes(char));
  const hasLetter = /[A-Za-z]/.test(raw);

  if (raw.length < 1 || raw.length > 22 || hasForbiddenChar || !hasLetter) return null;
  return raw;
}

/** Mascara o Price ID para log: `{first10}***{last4}`. */
function maskPriceId(priceId: string): string {
  return `${priceId.slice(0, 10)}***${priceId.slice(-4)}`;
}

/**
 * Primeiro campo do Price que diverge do catalogo, na ordem da guarda D-A3:
 * active, type, unit_amount, currency, livemode.
 */
function firstPriceDivergence(
  price: Stripe.Price,
  entry: EbookCatalogEntry,
  mode: 'test' | 'live',
): PriceGuardField | null {
  if (price.active !== true) return 'active';
  if (price.type !== 'one_time') return 'type';
  if (price.unit_amount !== entry.unitAmount) return 'unit_amount';
  if (price.currency !== entry.currency) return 'currency';
  if (price.livemode !== (mode === 'live')) return 'livemode';
  return null;
}

/**
 * Traduz erro Stripe em `EbookCheckoutError` (D-A13). Erro que nao e do Stripe
 * devolve `undefined` e sobe sem conversao. Loga so `type` e `code` do erro do
 * fornecedor; nunca o objeto de erro nem a mensagem.
 */
function toStripeCheckoutError(
  err: unknown,
  message: string,
  action: string,
): EbookCheckoutError | undefined {
  if (err instanceof Stripe.errors.StripeConnectionError) {
    logger.error('ebook checkout: falha de conexao com o gateway', {
      action,
      stripeErrorType: err.type,
      stripeErrorCode: err.code ?? null,
    });
    return new EbookCheckoutError('EBOOK_CHECKOUT_GATEWAY_TIMEOUT', message, 504);
  }
  if (err instanceof Stripe.errors.StripeError) {
    logger.error('ebook checkout: erro devolvido pelo gateway', {
      action,
      stripeErrorType: err.type,
      stripeErrorCode: err.code ?? null,
    });
    return new EbookCheckoutError('EBOOK_CHECKOUT_GATEWAY_ERROR', message, 502);
  }
  return undefined;
}

/**
 * Cria a Stripe Checkout Session de pagamento unico do ebook.
 *
 * Ordem (D-A2/D-A3/D-A8): entrada -> modo -> env do Price -> descritor ->
 * retrieve + guarda de Price -> URLs -> create -> `url` presente. Toda falha
 * vira `EbookCheckoutError` com codigo e status fechados; a mensagem do
 * fornecedor nunca chega a resposta.
 */
export async function createEbookCheckoutSession({
  slug,
  now = new Date(),
}: {
  slug: string;
  now?: Date;
}): Promise<{ checkoutUrl: string }> {
  const entry = getEbookBySlug(slug);
  if (!entry) {
    // Antes de haver entrada nao ha idioma do ebook: mensagem neutra curta do
    // mecanismo, sem copia de catalogo.
    throw new EbookCheckoutError('EBOOK_CHECKOUT_UNKNOWN_EBOOK', 'Unknown ebook.', 422);
  }

  const mode = resolveStripeMode(env.STRIPE_SECRET_KEY);

  // Env do Price nao esta no schema de `src/lib/env.ts` (que nao pode mudar):
  // le direto de process.env, tratando string vazia como ausente. So o NOME da
  // variavel vai para o log.
  const priceEnvName = entry.stripePriceEnv[mode];
  const rawPriceId = process.env[priceEnvName];
  const priceId = rawPriceId === undefined || rawPriceId === '' ? null : rawPriceId;
  if (priceId === null) {
    logger.warn('ebook checkout: env do Price ausente', {
      action: 'ebook_checkout',
      priceEnvName,
      stripeMode: mode,
    });
    throw new EbookCheckoutError(
      'EBOOK_CHECKOUT_UNAVAILABLE',
      entry.copy.errors.checkoutUnavailable,
      503,
    );
  }

  const statementDescriptorSuffix = resolveStatementDescriptorSuffix(
    process.env[EBOOK_STATEMENT_DESCRIPTOR_ENV],
  );
  if (statementDescriptorSuffix === null) {
    logger.warn('ebook checkout: descritor de extrato invalido', {
      action: 'ebook_checkout',
      envName: EBOOK_STATEMENT_DESCRIPTOR_ENV,
    });
    throw new EbookCheckoutError(
      'EBOOK_CHECKOUT_UNAVAILABLE',
      entry.copy.errors.checkoutUnavailable,
      503,
    );
  }

  const stripe = getStripe();

  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId, {}, {
      timeout: EBOOK_CHECKOUT_STRIPE_TIMEOUT_MS,
    });
  } catch (err) {
    const mapped = toStripeCheckoutError(
      err,
      entry.copy.errors.checkoutFailed,
      'ebook_checkout_price_retrieve',
    );
    throw mapped ?? err;
  }

  const divergence = firstPriceDivergence(price, entry, mode);
  if (divergence !== null) {
    logger.warn('ebook checkout: Price divergente do catalogo', {
      action: 'ebook_checkout_price_guard',
      divergentField: divergence,
      priceId: maskPriceId(priceId),
      stripeMode: mode,
    });
    throw new EbookCheckoutError(
      'EBOOK_CHECKOUT_UNAVAILABLE',
      entry.copy.errors.checkoutUnavailable,
      503,
    );
  }

  const { successUrl, cancelUrl } = buildEbookCheckoutUrls(entry.slug, env.NEXT_PUBLIC_APP_URL);

  // Mesmo conteudo em `metadata` e em `payment_intent_data.metadata` (D-A5).
  const metadata: Stripe.MetadataParam = {
    kind: 'ebook',
    ebook_slug: entry.slug,
    withdrawal_waiver_version: EBOOK_WITHDRAWAL_WAIVER_VERSION,
    withdrawal_waiver_at: now.toISOString(),
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        locale: entry.locale,
        submit_type: 'pay',
        adaptive_pricing: { enabled: false },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: {
          metadata,
          statement_descriptor_suffix: statementDescriptorSuffix,
        },
      },
      { timeout: EBOOK_CHECKOUT_STRIPE_TIMEOUT_MS },
    );
  } catch (err) {
    const mapped = toStripeCheckoutError(
      err,
      entry.copy.errors.checkoutFailed,
      'ebook_checkout_session_create',
    );
    throw mapped ?? err;
  }

  if (!session.url) {
    logger.error('ebook checkout: sessao criada sem url', {
      action: 'ebook_checkout_session_create',
      stripeMode: mode,
    });
    throw new EbookCheckoutError(
      'EBOOK_CHECKOUT_GATEWAY_ERROR',
      entry.copy.errors.checkoutFailed,
      502,
    );
  }

  return { checkoutUrl: session.url };
}
