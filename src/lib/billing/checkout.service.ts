import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { AppError } from '@/lib/errors';
import { PACKAGE_CREDITS, PACKAGE_LABELS } from '@/lib/constants/stripe-prices';
import { resolvePrice, toStripeCurrency } from '@/lib/pricing/config';
import type { PricePoint } from '@/lib/pricing/config';
import type { Currency } from '@/lib/currency';
import type {
  CreateCheckoutInput,
  CreateSubscriptionCheckoutInput,
} from '@/schemas/checkout.schema';
import { resolveIdempotencyKey } from '@/lib/billing/idempotency.service';
import { SubscriptionStatus } from '@/lib/constants/enums';
import {
  buildPlanAxisMetadata,
  calculateSubscriptionMonthlyAmountCents,
  resolveMonthlyPricePoint,
} from '@/lib/billing/subscription-pricing';
import { resolveChargeCurrency } from '@/lib/billing/currency-policy';

/**
 * Checkout service idempotente (T-028 / §12.4.1).
 *
 * Boundary de criação de Stripe Checkout Session que injeta uma Idempotency-Key
 * nativa do Stripe: repetição (mesmo usuário + pacote + payload, dentro da
 * janela) retorna a MESMA sessão; reuso da chave com payload divergente é
 * rejeitado pelo Stripe e mapeado para AppError 409.
 *
 * As regras de preço/crédito permanecem na fonte única (resolvePrice /
 * PACKAGE_CREDITS); aqui só montamos a sessão e aplicamos a idempotência.
 */
export class CheckoutService {
  private async ensureCustomer(userId: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, stripeCustomerId: true },
    });
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    });
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  /** Compra avulsa/pacote - idempotente. */
  async createOneTimeCheckout(
    userId: string,
    isFirstPurchase: boolean,
    data: CreateCheckoutInput,
    clientKey?: string | null,
  ): Promise<CheckoutResult> {
    const isPromo = isFirstPurchase && data.packageType === 'SINGLE';
    const resolvedType = isPromo ? 'PROMO' : data.packageType;
    const currency: Currency = resolveChargeCurrency({ explicit: data.currency });
    const price = resolvePrice(resolvedType, currency);
    const creditQty = PACKAGE_CREDITS[resolvedType];

    const idempotencyKey = resolveIdempotencyKey(
      { userId, packageType: resolvedType },
      clientKey,
      { kind: 'one_time', resolvedType, currency, isPromo },
    );

    const stripeCustomerId = await this.ensureCustomer(userId);

    // O line item passa pelo guard: quando ha Price pre-cadastrado no Stripe,
    // ele so entra na sessao depois de confrontado com o preco do catalogo —
    // o mesmo que a vitrine exibiu. Divergencia vira erro, nunca cobranca.
    const lineItem = await buildGuardedLineItem({
      price,
      currency,
      productName: `Corgly — ${PACKAGE_LABELS[resolvedType]}`,
    });

    return this.createWithIdempotency(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [lineItem],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?canceled=true`,
        metadata: {
          userId,
          packageType: resolvedType,
          creditQty: String(creditQty),
          currency,
        },
      },
      idempotencyKey,
    );
  }

  /** Assinatura - idempotente. */
  async createSubscriptionCheckout(
    userId: string,
    data: CreateSubscriptionCheckoutInput,
    clientKey?: string | null,
  ): Promise<CheckoutResult> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptions: true },
    });
    const activeStates: string[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL];
    const activeSub = user.subscriptions.find((s) => activeStates.includes(s.status as string));
    if (activeSub) {
      throw new AppError('PAYMENT_050', 'Usuário já possui assinatura ativa.', 409);
    }

    const currency: Currency = resolveChargeCurrency({ explicit: data.currency });

    // Ramificacao por eixo. O schema garante exatamente um dos dois campos; o
    // else final existe para o caso de o service ser chamado com dados crus
    // (Zero Silencio: erro explicito em vez de preco zerado).
    let plan: SubscriptionPlanLine;
    if (data.monthlyLessons !== undefined) {
      const lessons = data.monthlyLessons;
      // PricePoint inteiro (valor + priceId): a assinatura mensal passa pelo
      // mesmo guard da compra avulsa, entao o Price pre-cadastrado do catalogo
      // deixa de ser env decorativa e so e usado se bater com o preco exibido.
      const pricePoint = resolveMonthlyPricePoint(lessons, currency);
      plan = {
        pricePoint,
        productName: `Corgly Assinatura — ${lessons} aulas por mês`,
        // O eixo entra na chave idempotente: 10 aulas/mes e 2x/semana sao planos
        // diferentes e nao podem colidir na mesma Idempotency-Key.
        idempotencyScope: `SUBSCRIPTION_MONTHLY_${lessons}`,
        idempotencyPayload: { kind: 'subscription', monthlyLessons: lessons, currency },
        metadata: buildPlanAxisMetadata({ monthlyLessons: lessons }),
      };
    } else if (data.weeklyFrequency !== undefined) {
      const weeklyFrequency = data.weeklyFrequency;
      plan = {
        // Eixo legado nao tem Price no catalogo (o valor e calculado pela regra
        // antiga), entao o guard cai sempre em price_data com o valor canonico.
        pricePoint: {
          amountCents: calculateSubscriptionMonthlyAmountCents(weeklyFrequency, currency),
        },
        productName: `Corgly Assinatura — ${weeklyFrequency}× por semana`,
        idempotencyScope: 'SUBSCRIPTION',
        idempotencyPayload: { kind: 'subscription', weeklyFrequency, currency },
        metadata: buildPlanAxisMetadata({ weeklyFrequency }),
      };
    } else {
      throw new AppError(
        'VAL_003',
        'Informe monthlyLessons (10 ou 20 aulas por mês) ou weeklyFrequency (1 a 5 aulas por semana).',
        400,
      );
    }

    const idempotencyKey = resolveIdempotencyKey(
      { userId, packageType: plan.idempotencyScope },
      clientKey,
      plan.idempotencyPayload,
    );

    const stripeCustomerId = await this.ensureCustomer(userId);

    // `plan.metadata` ja carrega os DOIS eixos (o inativo como string vazia),
    // para nunca sobrar eixo antigo na metadata da Subscription do Stripe.
    const sessionMetadata = {
      userId,
      ...plan.metadata,
      currency,
    };

    const lineItem = await buildGuardedLineItem({
      price: plan.pricePoint,
      currency,
      productName: plan.productName,
      recurring: { interval: 'month' },
    });

    return this.createWithIdempotency(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [lineItem],
        mode: 'subscription',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?canceled=true`,
        metadata: sessionMetadata,
        // A metadata da sessao NAO desce sozinha para o objeto Subscription do
        // Stripe. Sem esta copia, `customer.subscription.updated` chegaria sem
        // eixo e o banco nao teria como reconciliar o plano contratado.
        subscription_data: { metadata: sessionMetadata },
      },
      idempotencyKey,
    );
  }

  private async createWithIdempotency(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const stripe = getStripe();
    try {
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
      const replayed =
        (session as { lastResponse?: { headers?: Record<string, string> } }).lastResponse?.headers?.[
          'idempotent-replayed'
        ] === 'true';
      return { url: session.url!, sessionId: session.id, idempotencyKey, replayed };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeIdempotencyError) {
        throw new AppError(
          'PAYMENT_061',
          'Requisição idempotente conflitante: mesma Idempotency-Key com payload divergente.',
          409,
        );
      }
      throw err;
    }
  }
}

/**
 * Mensagem unica de bloqueio por preco inconsistente. O detalhe tecnico vai
 * para o log de erro (ops); o aluno recebe um motivo acionavel sem vazar
 * configuracao interna.
 */
const PRICE_GUARD_USER_MESSAGE =
  'Não foi possível iniciar o pagamento: a configuração de preço no Stripe não confere com o valor exibido. A cobrança foi bloqueada por segurança. Tente novamente em instantes ou fale com o suporte.';

/** Entrada do guard de line item. */
export interface GuardedLineItemInput {
  /** Ponto de preco CANONICO do catalogo - o mesmo valor que a vitrine exibiu. */
  price: PricePoint;
  currency: Currency;
  /** Nome do produto usado quando o line item cai em `price_data`. */
  productName: string;
  /** Presente = assinatura mensal; ausente = compra avulsa. */
  recurring?: { interval: 'month' };
}

/**
 * Monta o line item do Checkout confrontando o Price do Stripe com o catalogo.
 *
 * DEFEITO QUE ESTA FUNCAO FECHA: a vitrine exibe SEMPRE `PricePoint.amountCents`
 * (via `resolvePrice` + PriceDisplay), mas o line item passava a usar
 * `price: priceId` assim que a env `STRIPE_PRICE_*` estivesse preenchida, sem
 * nada garantir que o Price cadastrado no Stripe valesse o mesmo. Um Price de
 * 199,00 em `STRIPE_PRICE_PACK10_USD` fazia a tela mostrar 190,00 e o cartao ser
 * debitado em 199,00, sem alarme nenhum.
 *
 * OPCAO ESCOLHIDA - (a) validar o Price no Stripe antes de montar o line item:
 * preserva o Price/Product pre-cadastrado (recibo e contabilidade corretos, que
 * e a razao documentada de existir `priceId` em `src/lib/pricing/config.ts`) e
 * torna a divergencia um erro explicito. A opcao (b) "sempre price_data"
 * transformaria todas as envs `STRIPE_PRICE_*` em configuracao orfa; a (c)
 * "exibir o valor lido do Stripe" colocaria uma chamada de rede no caminho de
 * render da vitrine e ainda deixaria um Price errado cobrar errado, so que
 * exibindo o valor errado junto.
 *
 * Nao ha fallback silencioso: Price ilegivel, inativo ou divergente em valor,
 * moeda ou recorrencia levanta AppError e a cobranca nao acontece. Cair em
 * `price_data` "para nao quebrar" mascararia exatamente a configuracao errada
 * que este guard existe para expor.
 */
export async function buildGuardedLineItem(
  input: GuardedLineItemInput,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  const { price, currency, productName, recurring } = input;
  const stripeCurrency = toStripeCurrency(currency);

  if (!price.priceId) {
    // Sem Price pre-cadastrado: `price_data` carrega o proprio valor canonico do
    // catalogo, entao exibicao e cobranca sao o mesmo numero por construcao.
    const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
      currency: stripeCurrency,
      unit_amount: price.amountCents,
      product_data: { name: productName },
    };
    if (recurring) priceData.recurring = recurring;
    return { price_data: priceData, quantity: 1 };
  }

  const priceId = price.priceId;
  let remote: Stripe.Price;
  try {
    remote = await getStripe().prices.retrieve(priceId);
  } catch (err) {
    console.error('[Checkout] Price configurado nao pode ser lido no Stripe', {
      priceId,
      currency,
      expectedAmountCents: price.amountCents,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError('PAYMENT_091', PRICE_GUARD_USER_MESSAGE, 500);
  }

  const expectedInterval = recurring?.interval ?? null;
  const remoteInterval = remote.recurring?.interval ?? null;
  const divergences: string[] = [];

  if (!remote.active) {
    divergences.push('price inativo no Stripe');
  }
  if (remote.unit_amount !== price.amountCents) {
    // Cobre tambem Price sem `unit_amount` (tiered/decimal): null !== numero.
    divergences.push(
      `unit_amount ${String(remote.unit_amount)} != catalogo ${price.amountCents}`,
    );
  }
  if (remote.currency !== stripeCurrency) {
    divergences.push(`currency ${remote.currency} != ${stripeCurrency}`);
  }
  if (remoteInterval !== expectedInterval) {
    divergences.push(
      `recorrencia ${remoteInterval ?? 'avulsa'} != ${expectedInterval ?? 'avulsa'}`,
    );
  }
  if (expectedInterval && (remote.recurring?.interval_count ?? 1) !== 1) {
    divergences.push(`interval_count ${String(remote.recurring?.interval_count)} != 1`);
  }

  if (divergences.length > 0) {
    console.error('[Checkout] Price do Stripe diverge do catalogo - cobranca bloqueada', {
      priceId,
      currency,
      expectedAmountCents: price.amountCents,
      divergences,
    });
    throw new AppError('PAYMENT_090', PRICE_GUARD_USER_MESSAGE, 500);
  }

  return { price: priceId, quantity: 1 };
}

/** Linha de assinatura ja resolvida por eixo (mensal canonico ou semanal legado). */
interface SubscriptionPlanLine {
  /**
   * Ponto de preco do catalogo (valor + priceId quando existir). E a UNICA
   * fonte de valor da linha: o guard cobra exatamente este numero, seja pelo
   * Price pre-cadastrado (depois de conferido) ou por `price_data`.
   */
  pricePoint: PricePoint;
  productName: string;
  /** Discrimina o eixo dentro da Idempotency-Key. */
  idempotencyScope: string;
  idempotencyPayload: Record<string, unknown>;
  /** Campos do eixo repassados na metadata da sessao Stripe (lidos no webhook). */
  metadata: Record<string, string>;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  /** Chave idempotente efetivamente usada - útil para auditoria/log. */
  idempotencyKey: string;
  /** true quando o Stripe respondeu com a sessão original (replay). */
  replayed: boolean;
}

export const checkoutService = new CheckoutService();
