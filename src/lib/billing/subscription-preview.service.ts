import 'server-only';

import Stripe from 'stripe';
import { z } from 'zod';
import { SubscriptionStatus } from '@/lib/constants/enums';
import { AppError } from '@/lib/errors';
import {
  LEGACY_WEEKS_PER_MONTH_CREDITS,
  calculateMonthlyLessonsAmountCents,
  calculateSubscriptionMonthlyAmountCents,
  legacyWeeklyEquivalent,
  normalizeMonthlyLessons,
  resolveSubscriptionMonthlyAmountCents,
  stripeCurrencyToCurrency,
} from '@/lib/billing/subscription-pricing';
import { MonthlyLessonsEnum, type MonthlyLessonsPlan } from '@/schemas/checkout.schema';
import { prisma } from '@/lib/prisma';
import { toStripeCurrency } from '@/lib/pricing/config';
import { getStripe } from '@/lib/stripe';

const ACTIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIAL,
];

/**
 * Preview aceita os DOIS eixos de plano, exatamente como o checkout e o update:
 *  - `monthlyLessons` (canonico): 10 ou 20 aulas por mes;
 *  - `weeklyFrequency` (legado): 1 a 5 aulas por semana.
 *
 * Exatamente um por requisicao — com os dois o preco alvo seria ambiguo.
 */
export const SubscriptionChangePreviewInputSchema = z
  .object({
    monthlyLessons: MonthlyLessonsEnum.optional(),
    weeklyFrequency: z
      .number()
      .int()
      .min(1)
      .max(5, { message: 'Frequência deve estar entre 1 e 5 aulas por semana.' })
      .optional(),
  })
  .refine(
    (data) => (data.monthlyLessons !== undefined) !== (data.weeklyFrequency !== undefined),
    {
      message:
        'Informe exatamente um eixo: monthlyLessons (10 ou 20 aulas por mes) ou weeklyFrequency (1 a 5 aulas por semana).',
      path: ['monthlyLessons'],
    },
  );

export type SubscriptionChangeType = 'upgrade' | 'downgrade' | 'current_plan';

export interface SubscriptionChangePreview {
  subscriptionId: string;
  /** Cadencia semanal legada vigente na assinatura. */
  currentWeeklyFrequency: number;
  /**
   * Cadencia semanal que a assinatura tera apos a troca. No eixo mensal e a
   * equivalencia legada gravada por `updateSubscription` (nao precifica nada).
   */
  requestedWeeklyFrequency: number;
  /** Volume mensal vigente; null quando a assinatura e legada (so cadencia). */
  currentMonthlyLessons: number | null;
  /** Volume mensal pedido; null quando o pedido veio pelo eixo legado. */
  requestedMonthlyLessons: number | null;
  changeType: SubscriptionChangeType;
  currency: string;
  currentMonthlyAmountCents: number;
  nextMonthlyAmountCents: number;
  prorationAmountCents: number;
  estimatedTaxCents: number;
  subtotalCents: number;
  totalCents: number;
  amountDueNowCents: number;
  effectiveAt: string;
  currentPeriodEnd: string;
  stripePreviewId: string | null;
  /**
   * Corpo pronto para o POST /api/v1/subscriptions/update. Carrega SOMENTE o
   * eixo pedido: aquele endpoint recusa os dois campos juntos.
   */
  previewPayload: {
    weeklyFrequency?: number;
    monthlyLessons?: MonthlyLessonsPlan;
    prorationDate: number;
  };
}

export { calculateSubscriptionMonthlyAmountCents } from '@/lib/billing/subscription-pricing';

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? 'usd').toLowerCase();
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function getNumberField(value: unknown, field: string): number {
  const record = getObjectRecord(value);
  const numberValue = record?.[field];
  return typeof numberValue === 'number' ? numberValue : 0;
}

function getStringField(value: unknown, field: string): string | null {
  const record = getObjectRecord(value);
  const stringValue = record?.[field];
  return typeof stringValue === 'string' ? stringValue : null;
}

function getProductId(item: Stripe.SubscriptionItem): string {
  const product = item.price.product;

  if (typeof product === 'string') return product;
  if (product && !product.deleted) return product.id;

  throw new AppError('PAYMENT_083', 'Produto da assinatura não encontrado no Stripe.', 500);
}

function isProrationLine(line: Stripe.InvoiceLineItem): boolean {
  const lineRecord = getObjectRecord(line);
  if (lineRecord?.proration === true) return true;

  const parent = getObjectRecord(lineRecord?.parent);
  const subscriptionItemDetails = getObjectRecord(parent?.subscription_item_details);
  return subscriptionItemDetails?.proration === true;
}

function sumTaxAmounts(invoice: Stripe.Invoice): number {
  const invoiceRecord = getObjectRecord(invoice);
  const totalTaxAmounts = invoiceRecord?.total_tax_amounts;
  const totalTaxes = invoiceRecord?.total_taxes;
  const taxRows = Array.isArray(totalTaxAmounts) && totalTaxAmounts.length > 0
    ? totalTaxAmounts
    : Array.isArray(totalTaxes)
      ? totalTaxes
      : [];

  return taxRows.reduce((sum, row) => sum + getNumberField(row, 'amount'), 0);
}

function sumProrationLines(invoice: Stripe.Invoice): number {
  const lines = invoice.lines?.data ?? [];
  return lines
    .filter(isProrationLine)
    .reduce((sum, line) => sum + getNumberField(line, 'amount'), 0);
}

function getPreviewId(invoice: Stripe.Invoice): string | null {
  return getStringField(invoice, 'id');
}

export async function previewSubscriptionChange(
  userId: string,
  input: unknown,
): Promise<SubscriptionChangePreview> {
  const parsed = SubscriptionChangePreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      'VAL_003',
      parsed.error.issues[0]?.message ?? 'Dados inválidos para preview de assinatura.',
      400,
    );
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    throw new AppError('PAYMENT_080', 'Nenhuma assinatura ativa encontrada.', 404);
  }

  const stripe = getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

  if ('deleted' in stripeSubscription && stripeSubscription.deleted) {
    throw new AppError('PAYMENT_081', 'Assinatura removida no Stripe.', 409);
  }

  const subscriptionItem = stripeSubscription.items.data[0];
  if (!subscriptionItem) {
    throw new AppError('PAYMENT_082', 'Item de assinatura não encontrado no Stripe.', 500);
  }

  const currentCurrency = stripeCurrencyToCurrency(subscriptionItem.price.currency);
  const stripeCurrency = toStripeCurrency(currentCurrency);

  // ── Eixo vigente da assinatura ────────────────────────────────────────────
  const currentWeeklyFrequency = subscription.weeklyFrequency;
  const currentMonthlyLessons =
    subscription.monthlyLessons != null
      ? normalizeMonthlyLessons(subscription.monthlyLessons)
      : null;
  const currentMonthlyAmountCents = resolveSubscriptionMonthlyAmountCents(
    subscription,
    currentCurrency,
  );
  const currentMonthlyCredits =
    currentMonthlyLessons ?? currentWeeklyFrequency * LEGACY_WEEKS_PER_MONTH_CREDITS;

  // ── Eixo pedido ───────────────────────────────────────────────────────────
  const requestedMonthlyLessons = parsed.data.monthlyLessons ?? null;
  const requestedWeeklyFrequency =
    requestedMonthlyLessons !== null
      ? // Equivalencia legada — e exatamente o valor que `updateSubscription`
        // grava na coluna `weeklyFrequency` quando o plano mensal e aplicado.
        legacyWeeklyEquivalent(requestedMonthlyLessons)
      : (parsed.data.weeklyFrequency as number);
  const nextMonthlyAmountCents =
    requestedMonthlyLessons !== null
      ? calculateMonthlyLessonsAmountCents(requestedMonthlyLessons, currentCurrency)
      : calculateSubscriptionMonthlyAmountCents(requestedWeeklyFrequency, currentCurrency);
  const requestedMonthlyCredits =
    requestedMonthlyLessons ?? requestedWeeklyFrequency * LEGACY_WEEKS_PER_MONTH_CREDITS;

  const prorationDate = Math.floor(Date.now() / 1000);
  const effectiveAt = new Date(prorationDate * 1000).toISOString();
  const currentPeriodEnd = subscription.currentPeriodEnd.toISOString();

  /**
   * Classificacao da troca — regra explicita para nao ficar ambigua entre eixos:
   *
   *  1. Mesmo eixo E mesmo valor  -> `current_plan`: nada muda, proracao zero e
   *     nenhuma chamada ao Stripe.
   *  2. Caso contrario, criterio primario e o VALOR MENSAL em centavos, unica
   *     grandeza comparavel entre um plano por cadencia e um plano por volume:
   *     maior = `upgrade`, menor = `downgrade`.
   *  3. Empate de valor entre eixos diferentes -> desempata pelo VOLUME DE
   *     CREDITOS mensais concedidos (monthlyLessons, ou weeklyFrequency x 4).
   *  4. Empate tambem nos creditos -> e uma migracao de eixo sem efeito
   *     financeiro; classificada como `upgrade` (proracao esperada de zero)
   *     porque o item ainda precisa ser atualizado no Stripe, e `current_plan`
   *     significa "nao chamar o Stripe".
   */
  const isSameAxisAndValue =
    requestedMonthlyLessons !== null
      ? currentMonthlyLessons === requestedMonthlyLessons
      : currentMonthlyLessons === null && currentWeeklyFrequency === requestedWeeklyFrequency;

  let changeType: SubscriptionChangeType;
  if (isSameAxisAndValue) {
    changeType = 'current_plan';
  } else if (nextMonthlyAmountCents !== currentMonthlyAmountCents) {
    changeType = nextMonthlyAmountCents > currentMonthlyAmountCents ? 'upgrade' : 'downgrade';
  } else if (requestedMonthlyCredits !== currentMonthlyCredits) {
    changeType = requestedMonthlyCredits > currentMonthlyCredits ? 'upgrade' : 'downgrade';
  } else {
    changeType = 'upgrade';
  }

  const basePreview = {
    subscriptionId: subscription.id,
    currentWeeklyFrequency,
    requestedWeeklyFrequency,
    currentMonthlyLessons,
    requestedMonthlyLessons,
    changeType,
    currentMonthlyAmountCents,
    nextMonthlyAmountCents,
    effectiveAt,
    currentPeriodEnd,
    // Somente o eixo pedido viaja no payload: o endpoint de update recusa os dois.
    previewPayload:
      requestedMonthlyLessons !== null
        ? { monthlyLessons: requestedMonthlyLessons, prorationDate }
        : { weeklyFrequency: requestedWeeklyFrequency, prorationDate },
  };

  if (changeType === 'current_plan') {
    return {
      ...basePreview,
      currency: stripeCurrency,
      prorationAmountCents: 0,
      estimatedTaxCents: 0,
      subtotalCents: 0,
      totalCents: 0,
      amountDueNowCents: 0,
      stripePreviewId: null,
    };
  }

  const productId = getProductId(subscriptionItem);

  const invoice = await stripe.invoices.createPreview({
    subscription: subscription.stripeSubscriptionId,
    subscription_details: {
      items: [
        {
          id: subscriptionItem.id,
          price_data: {
            currency: stripeCurrency,
            product: productId,
            recurring: { interval: 'month' },
            unit_amount: nextMonthlyAmountCents,
            tax_behavior: subscriptionItem.price.tax_behavior ?? undefined,
          },
        },
      ],
      proration_behavior: 'create_prorations',
      proration_date: prorationDate,
    },
  });

  const estimatedTaxCents = sumTaxAmounts(invoice);
  const subtotalCents = getNumberField(invoice, 'subtotal');
  const totalCents = getNumberField(invoice, 'total');
  const amountDueNowCents = getNumberField(invoice, 'amount_due');
  const prorationAmountCents = sumProrationLines(invoice);

  return {
    ...basePreview,
    currency: normalizeCurrency(getStringField(invoice, 'currency') ?? stripeCurrency),
    prorationAmountCents,
    estimatedTaxCents,
    subtotalCents,
    totalCents,
    amountDueNowCents,
    stripePreviewId: getPreviewId(invoice),
  };
}
