import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { AppError } from '@/lib/errors';
import { PACKAGE_PRICES, PACKAGE_CREDITS, PACKAGE_LABELS } from '@/lib/constants/stripe-prices';
import type { CreateCheckoutInput, CreateSubscriptionCheckoutInput } from '@/schemas/checkout.schema';
import { SubscriptionStatus } from '@/lib/constants/enums';

const CREDIT_EXPIRY_6M_MS = 6 * 30 * 24 * 60 * 60 * 1000;

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
    const unitAmount = PACKAGE_PRICES[resolvedType];
    const creditQty = PACKAGE_CREDITS[resolvedType];

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name: `Corgly — ${PACKAGE_LABELS[resolvedType]}` },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?canceled=true`,
      metadata: {
        userId,
        packageType: resolvedType,
        creditQty: String(creditQty),
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
    const activeSub = user.subscriptions.find((s) =>
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL].includes(s.status as typeof SubscriptionStatus[keyof typeof SubscriptionStatus]),
    );
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

    // Calcular preço: weeklyFrequency × $16 × 4.33 semanas
    const monthlyAmountCents = Math.ceil(data.weeklyFrequency * 16 * 4.33 * 100);

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
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
  ): Promise<void> {
    if (newWeeklyFrequency < 1 || newWeeklyFrequency > 5) {
      throw new AppError('VAL_003', 'weeklyFrequency deve estar entre 1 e 5.', 400);
    }

    const stripe = getStripe();

    // Buscar assinatura atual para obter o item ID
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) throw new AppError('SYS_001', 'Item de assinatura não encontrado.', 500);

    const monthlyAmountCents = Math.ceil(newWeeklyFrequency * 16 * 4.33 * 100);

    await stripe.subscriptions.update(stripeSubscriptionId, {
      proration_behavior: 'create_prorations',
      items: [
        {
          id: itemId,
          price_data: {
            currency: 'usd',
            unit_amount: monthlyAmountCents,
            recurring: { interval: 'month' },
            product_data: {
              name: `Corgly — ${newWeeklyFrequency}× por semana`,
            },
          },
        },
      ],
    });

    // Atualizar frequência no banco
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { weeklyFrequency: newWeeklyFrequency },
    });
  }

  // ─── Webhook ───────────────────────────────────────────────────────────────

  /** Roteador de webhooks Stripe — valida assinatura e delega por tipo de evento. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.constructEvent(rawBody, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
        );
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Eventos não tratados: 200 silencioso
        break;
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

    const subscriptionId = invoice.subscription as string;
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
          stripePaymentIntentId: (invoice.payment_intent as string) ?? `pi_${invoice.id}`,
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
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
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

export const stripeService = new StripeService();
