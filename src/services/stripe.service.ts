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
  calculateMonthlyLessonsAmountCents,
  calculateSubscriptionMonthlyAmountCents,
  legacyWeeklyEquivalent,
  resolveMonthlyCredits,
  stripeCurrencyToCurrency,
} from '@/lib/billing/subscription-pricing';
import type { MonthlyLessonsPlan } from '@/schemas/checkout.schema';

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
   *
   * Dois eixos mutuamente exclusivos (o schema garante exatamente um):
   *  - `monthlyLessons` (canonico): 10 ou 20 aulas/mes, preco vindo de PRICING;
   *  - `weeklyFrequency` (legado): 1..5 aulas/semana × $16/aula × 4.33 semanas.
   *
   * O eixo tambem viaja em `subscription_data.metadata`, para o objeto
   * Subscription do Stripe carregar o plano e o webhook conseguir persistir
   * `monthlyLessons` sem adivinhar.
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

    // O priceId pre-cadastrado nao e usado aqui porque o valor da assinatura
    // varia por eixo; o preco sai sempre da tabela unica (PRICING) ou da regra
    // legada, nunca de conversao local.
    const currency: Currency = data.currency ?? 'USD';

    let amountCents: number;
    let productName: string;
    let planMetadata: Record<string, string>;

    if (data.monthlyLessons !== undefined) {
      const lessons = data.monthlyLessons;
      amountCents = calculateMonthlyLessonsAmountCents(lessons, currency);
      productName = `Corgly Assinatura — ${lessons} aulas por mês`;
      planMetadata = { monthlyLessons: String(lessons) };
    } else if (data.weeklyFrequency !== undefined) {
      const weeklyFrequency = data.weeklyFrequency;
      amountCents = calculateSubscriptionMonthlyAmountCents(weeklyFrequency, currency);
      productName = `Corgly Assinatura — ${weeklyFrequency}× por semana`;
      planMetadata = { weeklyFrequency: String(weeklyFrequency) };
    } else {
      throw new AppError(
        'VAL_003',
        'Informe monthlyLessons (10 ou 20 aulas por mês) ou weeklyFrequency (1 a 5 aulas por semana).',
        400,
      );
    }

    const sessionMetadata = { userId, ...planMetadata, currency };

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: toStripeCurrency(currency),
            unit_amount: amountCents,
            recurring: { interval: 'month' },
            product_data: {
              name: productName,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?canceled=true`,
      metadata: sessionMetadata,
      // Propaga o eixo para o objeto Subscription do Stripe: sem isso a
      // metadata morre na sessao e o webhook nao sabe qual plano foi vendido.
      subscription_data: { metadata: sessionMetadata },
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
   * Atualiza o plano de uma assinatura, em qualquer um dos dois eixos.
   * Cria prorações automaticamente (proration_behavior: 'create_prorations').
   *
   * `plan` aceita:
   *  - `number` — cadencia semanal legada (1..5), assinatura antiga;
   *  - `{ monthlyLessons }` — eixo canonico (10 ou 20 aulas/mes).
   *
   * O eixo escolhido e persistido no banco: trocar para o eixo mensal grava
   * `monthlyLessons`; trocar para o legado zera `monthlyLessons` para NULL, de
   * modo que a assinatura nunca fica com os dois eixos preenchidos ao mesmo
   * tempo (preco e creditos deixariam de ser deterministicos).
   */
  async updateSubscription(
    stripeSubscriptionId: string,
    plan: number | SubscriptionPlanUpdate,
    idempotencyKey?: string | null,
    options: { prorationDate?: number } = {},
  ): Promise<void> {
    const normalizedPlan: SubscriptionPlanUpdate =
      typeof plan === 'number' ? { weeklyFrequency: plan } : plan;

    if (
      'weeklyFrequency' in normalizedPlan &&
      (normalizedPlan.weeklyFrequency < 1 || normalizedPlan.weeklyFrequency > 5)
    ) {
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
    const monthlyAmountCents =
      'monthlyLessons' in normalizedPlan
        ? calculateMonthlyLessonsAmountCents(normalizedPlan.monthlyLessons, currentCurrency)
        : calculateSubscriptionMonthlyAmountCents(
            normalizedPlan.weeklyFrequency,
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
        // Mantem o eixo vigente na metadata do Stripe: o webhook de
        // customer.subscription.updated le dali para reconciliar o banco.
        metadata:
          'monthlyLessons' in normalizedPlan
            ? { monthlyLessons: String(normalizedPlan.monthlyLessons) }
            : { weeklyFrequency: String(normalizedPlan.weeklyFrequency) },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Persistir o eixo no banco. Apenas um dos dois vale por assinatura.
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data:
        'monthlyLessons' in normalizedPlan
          ? {
              monthlyLessons: normalizedPlan.monthlyLessons,
              // Cadencia legada aproximada, so para o campo NOT NULL continuar
              // coerente na UI antiga. NAO precifica nem concede credito.
              weeklyFrequency: legacyWeeklyEquivalent(normalizedPlan.monthlyLessons),
            }
          : { weeklyFrequency: normalizedPlan.weeklyFrequency, monthlyLessons: null },
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
    // Sessao de assinatura nao gera lote de credito aqui: ela materializa o
    // registro Subscription (com o eixo contratado) e os creditos vem depois,
    // em invoice.paid.
    if (session.mode === 'subscription') {
      await this.upsertSubscriptionFromSession(session);
      return;
    }

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

    // Creditos mensais: `monthlyLessons` quando a assinatura foi contratada no
    // eixo canonico; senao a regra legada (weeklyFrequency × 4 semanas).
    const totalCredits = resolveMonthlyCredits(sub);

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
    // O eixo so e reconciliado quando a metadata do Stripe realmente carrega
    // `monthlyLessons`; metadata ausente NAO apaga o eixo ja gravado.
    const monthlyLessons = readMonthlyLessons(stripeSub.metadata);

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: this.mapSubscriptionStatus(stripeSub.status),
        currentPeriodStart: new Date((stripeSub as Stripe.Subscription & { current_period_start: number }).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSub as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000),
        ...(monthlyLessons !== null ? { monthlyLessons } : {}),
      },
    });
  }

  /**
   * Materializa/atualiza o registro local de Subscription a partir da sessao de
   * checkout concluida. O eixo vem da metadata da sessao: `monthlyLessons`
   * quando o plano canonico foi comprado, senao `weeklyFrequency` legado.
   */
  private async upsertSubscriptionFromSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    const stripeSubscriptionId = resolveStripeId(
      session.subscription as string | { id?: string } | null | undefined,
    );

    if (!userId || !stripeSubscriptionId) {
      console.error(
        '[Webhook] checkout.session.completed (subscription): metadata/subscription ausente',
        session.id,
      );
      return;
    }

    const monthlyLessons = readMonthlyLessons(session.metadata);
    const weeklyFrequency =
      monthlyLessons !== null
        ? legacyWeeklyEquivalent(monthlyLessons)
        : readWeeklyFrequency(session.metadata);

    if (monthlyLessons === null && weeklyFrequency === null) {
      console.error(
        '[Webhook] checkout.session.completed (subscription): nenhum eixo de plano na metadata',
        session.id,
      );
      return;
    }

    // Periodo e status reais vem do objeto Subscription do Stripe — nunca
    // estimados localmente. Na API 2026-02-25.clover o periodo de cobranca mora
    // no SubscriptionItem, nao na Subscription.
    const stripeSub = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
    const periodItem = stripeSub.items.data[0];

    if (!periodItem) {
      console.error(
        '[Webhook] checkout.session.completed (subscription): assinatura sem item no Stripe',
        stripeSubscriptionId,
      );
      return;
    }

    const data = {
      status: this.mapSubscriptionStatus(stripeSub.status),
      currentPeriodStart: new Date(periodItem.current_period_start * 1000),
      currentPeriodEnd: new Date(periodItem.current_period_end * 1000),
      weeklyFrequency: weeklyFrequency ?? LEGACY_WEEKLY_FALLBACK,
      monthlyLessons,
    };

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId },
      create: { userId, stripeSubscriptionId, ...data },
      update: data,
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

/** Eixo aceito por `updateSubscription`. Apenas um por chamada. */
export type SubscriptionPlanUpdate =
  | { monthlyLessons: MonthlyLessonsPlan }
  | { weeklyFrequency: number };

/**
 * Cadencia semanal minima usada quando o plano mensal nao permite derivar nada
 * melhor. Existe so porque `weeklyFrequency` e NOT NULL no banco (coluna legada).
 */
const LEGACY_WEEKLY_FALLBACK = 1;

/**
 * Le `monthlyLessons` de uma metadata Stripe. So aceita os volumes do catalogo
 * (10 ou 20): valor fora disso nao tem preco e NAO e arredondado em silencio —
 * vira null e o chamador trata como eixo ausente.
 */
function readMonthlyLessons(
  metadata: Stripe.Metadata | null | undefined,
): MonthlyLessonsPlan | null {
  const raw = metadata?.monthlyLessons;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (parsed !== 10 && parsed !== 20) {
    console.error('[Webhook] metadata.monthlyLessons fora do catalogo (10|20):', raw);
    return null;
  }
  return parsed;
}

/**
 * Le `weeklyFrequency` de uma metadata Stripe. Faixa legada fechada em 1..5;
 * fora dela retorna null em vez de truncar (o preco seria inventado).
 */
function readWeeklyFrequency(metadata: Stripe.Metadata | null | undefined): number | null {
  const raw = metadata?.weeklyFrequency;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    console.error('[Webhook] metadata.weeklyFrequency fora da faixa legada (1..5):', raw);
    return null;
  }
  return parsed;
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
