import Stripe from 'stripe';
import type { Prisma, StripeWebhookEvent } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { AppError } from '@/lib/errors';
import { PACKAGE_CREDITS, PACKAGE_LABELS } from '@/lib/constants/stripe-prices';
import type { CreateCheckoutInput, CreateSubscriptionCheckoutInput } from '@/schemas/checkout.schema';
import { SubscriptionStatus } from '@/lib/constants/enums';
import { resolvePrice, toStripeCurrency } from '@/lib/pricing/config';
import type { Currency } from '@/lib/currency';
import {
  calculateSubscriptionMonthlyAmountCents,
  stripeCurrencyToCurrency,
} from '@/lib/billing/subscription-pricing';

const CREDIT_EXPIRY_6M_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const WEBHOOK_TERMINAL_STATUSES = new Set(['PROCESSED', 'IGNORED']);

export interface StripeWebhookEventDTO {
  id: string;
  eventId: string;
  type: string;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  lastReplayAt: string | null;
  replayCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StripeWebhookReplayResult {
  event: StripeWebhookEventDTO;
  idempotentReplay: boolean;
}

export class StripeService {
  // ─── Checkout ──────────────────────────────────────────────────────────────

  /**
   * Cria uma Stripe Checkout Session para compra avulsa/pacote.
   * isFirstPurchase=true + SINGLE → preço PROMO ($12.50).
   */
  async createCheckoutSession(
    userId: string,
    isFirstPurchase: boolean,
    data: CreateCheckoutInput,
  ): Promise<{ url: string; sessionId: string }> {
    const stripe = getStripe();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, stripeCustomerId: true },
    });

    // Upsert Stripe Customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } });
    }

    // Primeira compra de SINGLE → PROMO
    const isPromo = isFirstPurchase && data.packageType === 'SINGLE';
    const resolvedType = isPromo ? 'PROMO' : data.packageType;
    const currency: Currency = data.currency ?? 'USD';
    const price = resolvePrice(resolvedType, currency);
    const creditQty = PACKAGE_CREDITS[resolvedType];

    // Prioriza priceId pre-cadastrado no Stripe (recibo + contabilidade corretos);
    // cai em price_data quando priceId nao foi configurado para o par moeda/pack.
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

    const session = await stripe.checkout.sessions.create({
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
    });

    return { url: session.url!, sessionId: session.id };
  }

  /**
   * Cria Stripe Checkout Session para assinatura mensal.
   * Calcula preço com base em weeklyFrequency × $16/aula × 4.33 semanas/mês.
   */
  async createSubscriptionCheckout(
    userId: string,
    data: CreateSubscriptionCheckoutInput,
  ): Promise<{ url: string; sessionId: string }> {
    const stripe = getStripe();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, stripeCustomerId: true, subscriptions: true },
    });

    // Bloquear assinatura duplicada ativa
    const activeStates: string[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL];
    const activeSub = user.subscriptions.find((s) => activeStates.includes(s.status));
    if (activeSub) {
      throw new AppError('PAYMENT_050', 'Usuário já possui assinatura ativa.', 409);
    }

    // Upsert Customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } });
    }

    // O priceId nao e usado aqui porque a assinatura e variavel (frequencia 1..5).
    const currency: Currency = data.currency ?? 'USD';
    const monthlyAmountCents = calculateSubscriptionMonthlyAmountCents(
      data.weeklyFrequency,
      currency,
    );

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: toStripeCurrency(currency),
            unit_amount: monthlyAmountCents,
            recurring: { interval: 'month' },
            product_data: {
              name: `Corgly Assinatura — ${data.weeklyFrequency}× por semana`,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?canceled=true`,
      metadata: {
        userId,
        weeklyFrequency: String(data.weeklyFrequency),
        currency,
      },
    });

    return { url: session.url!, sessionId: session.id };
  }

  /**
   * Cancela assinatura ao final do período (cancel_at_period_end: true).
   * Não cancela imediatamente — assinatura permanece ativa até currentPeriodEnd.
   */
  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    const stripe = getStripe();
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  /**
   * Atualiza frequência semanal de uma assinatura.
   * Cria prorações automaticamente (proration_behavior: 'create_prorations').
   */
  async updateSubscription(
    stripeSubscriptionId: string,
    newWeeklyFrequency: number,
    idempotencyKey?: string | null,
    options: { prorationDate?: number } = {},
  ): Promise<void> {
    if (newWeeklyFrequency < 1 || newWeeklyFrequency > 5) {
      throw new AppError('VAL_003', 'weeklyFrequency deve estar entre 1 e 5.', 400);
    }

    const stripe = getStripe();

    // Buscar assinatura atual para obter o item ID
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const subscriptionItem = stripeSub.items.data[0];
    if (!subscriptionItem) throw new AppError('SYS_001', 'Item de assinatura não encontrado.', 500);

    const product = subscriptionItem.price.product;
    const productId = typeof product === 'string'
      ? product
      : product && !product.deleted
        ? product.id
        : null;
    if (!productId) throw new AppError('PAYMENT_083', 'Produto da assinatura não encontrado no Stripe.', 500);

    const currentCurrency = stripeCurrencyToCurrency(subscriptionItem.price.currency);
    const monthlyAmountCents = calculateSubscriptionMonthlyAmountCents(
      newWeeklyFrequency,
      currentCurrency,
    );

    await stripe.subscriptions.update(
      stripeSubscriptionId,
      {
        proration_behavior: 'create_prorations',
        proration_date: options.prorationDate,
        items: [
          {
            id: subscriptionItem.id,
            price_data: {
              currency: toStripeCurrency(currentCurrency),
              unit_amount: monthlyAmountCents,
              recurring: { interval: 'month' },
              product: productId,
              tax_behavior: subscriptionItem.price.tax_behavior ?? undefined,
            },
          },
        ],
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Atualizar frequência no banco
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { weeklyFrequency: newWeeklyFrequency },
    });
  }

  // ─── Webhook ───────────────────────────────────────────────────────────────

  /** Roteador de webhooks Stripe: valida assinatura antes de qualquer parsing confiavel. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.constructEvent(rawBody, signature);
    await this.processWebhookEvent(event, rawBody.toString('utf8'), false);
  }

  async listWebhookEvents(status?: string): Promise<{ items: StripeWebhookEventDTO[]; total: number }> {
    const where = status ? { status: status as never } : undefined;
    const [items, total] = await Promise.all([
      prisma.stripeWebhookEvent.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
      }),
      prisma.stripeWebhookEvent.count({ where }),
    ]);

    return { items: items.map(toWebhookDTO), total };
  }

  async replayWebhookEvent(eventId: string): Promise<StripeWebhookReplayResult> {
    const stored = await prisma.stripeWebhookEvent.findUnique({ where: { eventId } });
    if (!stored) {
      throw new AppError('PAYMENT_070', 'Evento Stripe não encontrado.', 404);
    }
    if (stored.status === 'PROCESSING') {
      throw new AppError('PAYMENT_071', 'Evento Stripe já está em processamento.', 409);
    }
    if (!stored.payload || typeof stored.payload !== 'object') {
      throw new AppError('PAYMENT_072', 'Payload do evento Stripe indisponível para replay.', 409);
    }

    const event = stored.payload as unknown as Stripe.Event;
    if (!event.id || !event.type || !event.data) {
      throw new AppError('PAYMENT_073', 'Payload do evento Stripe está inválido para replay.', 409);
    }

    return this.processWebhookEvent(event, stored.rawPayload ?? null, true);
  }

  private async processWebhookEvent(
    event: Stripe.Event,
    rawPayload: string | null,
    replay: boolean,
  ): Promise<StripeWebhookReplayResult> {
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existing && WEBHOOK_TERMINAL_STATUSES.has(existing.status) && !replay) {
      return { event: toWebhookDTO(existing), idempotentReplay: true };
    }

    const stored =
      existing ??
      (await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          status: 'RECEIVED',
          rawPayload,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      }));

    await prisma.stripeWebhookEvent.update({
      where: { id: stored.id },
      data: {
        status: 'PROCESSING',
        type: event.type,
        rawPayload: rawPayload ?? stored.rawPayload,
        payload: event as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        ...(replay ? { lastReplayAt: new Date(), replayCount: { increment: 1 } } : {}),
      },
    });

    try {
      const handled = await this.dispatchWebhookEvent(event);
      const updated = await prisma.stripeWebhookEvent.update({
        where: { id: stored.id },
        data: {
          status: handled ? 'PROCESSED' : 'IGNORED',
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      return { event: toWebhookDTO(updated), idempotentReplay: false };
    } catch (error) {
      await prisma.stripeWebhookEvent.update({
        where: { id: stored.id },
        data: {
          status: 'FAILED',
          errorMessage: errorToMessage(error),
        },
      });
      throw error;
    }
  }

  private async dispatchWebhookEvent(event: Stripe.Event): Promise<boolean> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
        );
        return true;
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        return true;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        return true;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return true;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        return true;
      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object as Stripe.Charge);
        return true;
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
      case 'charge.dispute.funds_withdrawn':
      case 'charge.dispute.funds_reinstated':
        await this.onChargeDispute(event.data.object as Stripe.Dispute);
        return true;
      default:
        return false;
    }
  }

  /** Valida assinatura Stripe e retorna evento tipado. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }

  // ─── Handlers internos ────────────────────────────────────────────────────

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
    stripeEventId: string,
  ): Promise<void> {
    const { userId, packageType, creditQty } = session.metadata ?? {};
    if (!userId || !packageType || !creditQty) {
      console.error('[Webhook] checkout.session.completed: metadata incompleto', session.id);
      return;
    }

    // Idempotência: PAYMENT_051 — evento duplicado ignorado silenciosamente
    const existing = await prisma.payment.findUnique({ where: { stripeEventId } });
    if (existing) {
      console.log(`[Webhook] PAYMENT_051: evento duplicado ignorado: ${stripeEventId}`);
      return;
    }

    const TYPES_WITH_EXPIRY = ['SINGLE', 'PACK_5', 'PACK_10', 'PROMO'];
    const expiresAt = TYPES_WITH_EXPIRY.includes(packageType)
      ? new Date(Date.now() + CREDIT_EXPIRY_6M_MS)
      : null;

    await prisma.$transaction(async (tx) => {
      const batch = await tx.creditBatch.create({
        data: {
          userId,
          type: packageType as 'SINGLE' | 'PACK_5' | 'PACK_10' | 'PROMO' | 'MONTHLY' | 'MANUAL' | 'REFUND',
          totalCredits: parseInt(creditQty),
          usedCredits: 0,
          expiresAt,
        },
      });

      await tx.payment.create({
        data: {
          userId,
          stripePaymentIntentId: (session.payment_intent as string) ?? `pi_${session.id}`,
          stripeEventId,
          amount: session.amount_total ?? 0,
          currency: session.currency ?? 'usd',
          status: 'SUCCEEDED',
          creditBatchId: batch.id,
        },
      });

      // Primeira compra: marcar isFirstPurchase = false
      if (packageType === 'PROMO') {
        await tx.user.update({ where: { id: userId }, data: { isFirstPurchase: false } });
      }
    });
  }

  private async onInvoicePaid(invoice: Stripe.Invoice, stripeEventId: string): Promise<void> {
    // Idempotência
    const existing = await prisma.payment.findUnique({ where: { stripeEventId } });
    if (existing) return;

    const invoiceWithLegacyFields = invoice as Stripe.Invoice & {
      payment_intent?: string | null;
      subscription?: string | null;
    };
    const subscriptionId = invoiceWithLegacyFields.subscription as string;
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (!sub) {
      // Pode ser invoice de checkout subscription antes do record existir
      console.warn(`[Webhook] Subscription não encontrada: ${subscriptionId}`);
      return;
    }

    // Créditos mensais: weeklyFrequency × 4 semanas
    const totalCredits = sub.weeklyFrequency * 4;

    await prisma.$transaction(async (tx) => {
      const batch = await tx.creditBatch.create({
        data: {
          userId: sub.userId,
          type: 'MONTHLY',
          totalCredits,
          usedCredits: 0,
          expiresAt: null, // RESOLVED: MONTHLY credits never expire (P048)
        },
      });

      await tx.payment.create({
        data: {
          userId: sub.userId,
          stripePaymentIntentId: invoiceWithLegacyFields.payment_intent ?? `pi_${invoice.id}`,
          stripeEventId,
          amount: invoice.amount_paid,
          currency: invoice.currency,
          status: 'SUCCEEDED',
          creditBatchId: batch.id,
        },
      });
    });
  }

  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: this.mapSubscriptionStatus(stripeSub.status),
        currentPeriodStart: new Date((stripeSub as Stripe.Subscription & { current_period_start: number }).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSub as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000),
      },
    });
  }

  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = (invoice as Stripe.Invoice & { subscription?: string | null }).subscription;
    if (!subscriptionId) return;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
  }

  private async onChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId = resolveStripeId(charge.payment_intent);
    if (!paymentIntentId) return;

    await prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'REFUNDED' },
    });
  }

  private async onChargeDispute(dispute: Stripe.Dispute): Promise<void> {
    const paymentIntentId = resolveStripeId(
      (dispute as Stripe.Dispute & { payment_intent?: string | Stripe.PaymentIntent | null })
        .payment_intent,
    );
    if (!paymentIntentId) return;

    await prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'FAILED' },
    });
  }

  private mapSubscriptionStatus(
    stripeStatus: Stripe.Subscription.Status,
  ): typeof SubscriptionStatus[keyof typeof SubscriptionStatus] {
    switch (stripeStatus) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIAL;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELLED;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}

function resolveStripeId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id ?? null;
}

function toWebhookDTO(event: StripeWebhookEvent): StripeWebhookEventDTO {
  return {
    id: event.id,
    eventId: event.eventId,
    type: event.type,
    status: event.status,
    errorMessage: event.errorMessage,
    processedAt: event.processedAt?.toISOString() ?? null,
    lastReplayAt: event.lastReplayAt?.toISOString() ?? null,
    replayCount: event.replayCount,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Erro desconhecido ao processar webhook Stripe.';
}

export const stripeService = new StripeService();
