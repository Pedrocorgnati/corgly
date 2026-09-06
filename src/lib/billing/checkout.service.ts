import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { AppError } from '@/lib/errors';
import { PACKAGE_CREDITS, PACKAGE_LABELS } from '@/lib/constants/stripe-prices';
import { resolvePrice, toStripeCurrency } from '@/lib/pricing/config';
import type { Currency } from '@/lib/currency';
import type {
  CreateCheckoutInput,
  CreateSubscriptionCheckoutInput,
} from '@/schemas/checkout.schema';
import { resolveIdempotencyKey } from '@/lib/billing/idempotency.service';
import { SubscriptionStatus } from '@/lib/constants/enums';
import {
  calculateMonthlyLessonsAmountCents,
  calculateSubscriptionMonthlyAmountCents,
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

    const lineItem = price.priceId
      ? { price: price.priceId, quantity: 1 }
      : {
          price_data: {
            currency: toStripeCurrency(currency),
            unit_amount: price.amountCents,
            product_data: { name: `Corgly — ${PACKAGE_LABELS[resolvedType]}` },
          },
          quantity: 1,
        };

    return this.createWithIdempotency(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [lineItem as Stripe.Checkout.SessionCreateParams.LineItem],
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
      plan = {
        amountCents: calculateMonthlyLessonsAmountCents(lessons, currency),
        productName: `Corgly Assinatura — ${lessons} aulas por mês`,
        // O eixo entra na chave idempotente: 10 aulas/mes e 2x/semana sao planos
        // diferentes e nao podem colidir na mesma Idempotency-Key.
        idempotencyScope: `SUBSCRIPTION_MONTHLY_${lessons}`,
        idempotencyPayload: { kind: 'subscription', monthlyLessons: lessons, currency },
        metadata: { monthlyLessons: String(lessons) },
      };
    } else if (data.weeklyFrequency !== undefined) {
      const weeklyFrequency = data.weeklyFrequency;
      plan = {
        amountCents: calculateSubscriptionMonthlyAmountCents(weeklyFrequency, currency),
        productName: `Corgly Assinatura — ${weeklyFrequency}× por semana`,
        idempotencyScope: 'SUBSCRIPTION',
        idempotencyPayload: { kind: 'subscription', weeklyFrequency, currency },
        metadata: { weeklyFrequency: String(weeklyFrequency) },
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

    const sessionMetadata = {
      userId,
      ...plan.metadata,
      currency,
    };

    return this.createWithIdempotency(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: toStripeCurrency(currency),
              unit_amount: plan.amountCents,
              recurring: { interval: 'month' },
              product_data: {
                name: plan.productName,
              },
            },
            quantity: 1,
          },
        ],
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

/** Linha de assinatura ja resolvida por eixo (mensal canonico ou semanal legado). */
interface SubscriptionPlanLine {
  amountCents: number;
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
