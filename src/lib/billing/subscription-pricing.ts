import type { Currency } from '@/lib/currency';
import { isSupportedCurrency } from '@/lib/currency';
import { monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import type { MonthlyLessonsPlan } from '@/schemas/checkout.schema';

/**
 * Precificacao de assinatura — dois eixos, uma unica fonte de cambio.
 *
 * Eixo LEGADO (`weeklyFrequency`): preco derivado de US$ 16/aula x 4,33
 * semanas/mes, com a tabela de FX abaixo. Continua valendo para as assinaturas
 * criadas antes do eixo mensal; nao mexer nos numeros, ha cobranca viva neles.
 *
 * Eixo CANONICO (`monthlyLessons`): preco vem de `PRICING` em
 * `src/lib/pricing/config.ts`, que ja carrega as 4 moedas. Aqui NAO existe
 * tabela de cambio nova — `currency-policy.ts` proibe reimplementar cambio fora
 * do modulo canonico.
 */

const WEEKLY_CLASS_PRICE_CENTS = 1600;
const AVERAGE_WEEKS_PER_MONTH = 4.33;

/** FX exclusivo do preco LEGADO por cadencia semanal. Nao usar para plano mensal. */
const SUBSCRIPTION_FX: Record<Currency, number> = {
  USD: 1,
  USDC: 1,
  EUR: 0.92,
  BRL: 5,
};

/** Creditos concedidos por mes no eixo legado: cadencia semanal x 4 semanas. */
export const LEGACY_WEEKS_PER_MONTH_CREDITS = 4;

export function calculateSubscriptionMonthlyAmountCents(
  weeklyFrequency: number,
  currency: Currency = 'USD',
): number {
  const baseUsdCents = Math.ceil(
    weeklyFrequency * WEEKLY_CLASS_PRICE_CENTS * AVERAGE_WEEKS_PER_MONTH,
  );
  return Math.ceil(baseUsdCents * SUBSCRIPTION_FX[currency]);
}

/**
 * Preco mensal do eixo canonico: 10 aulas = MONTHLY_10, 20 aulas = MONTHLY_20.
 * Delega a `resolvePrice`, que ja resolve a moeda pela tabela unica.
 */
export function calculateMonthlyLessonsAmountCents(
  lessons: MonthlyLessonsPlan,
  currency: Currency = 'USD',
): number {
  return resolvePrice(monthlyPackageType(lessons), currency).amountCents;
}

/**
 * Creditos mensais concedidos por uma assinatura, seja qual for o eixo.
 * `monthlyLessons` presente vence; ausente cai na regra legada.
 */
export function resolveMonthlyCredits(subscription: {
  monthlyLessons?: number | null;
  weeklyFrequency: number;
}): number {
  return (
    subscription.monthlyLessons ??
    subscription.weeklyFrequency * LEGACY_WEEKS_PER_MONTH_CREDITS
  );
}

/**
 * Valor mensal vigente de uma assinatura persistida, respeitando o eixo em que
 * ela foi contratada. Usado para comparar planos (preview de troca) sem assumir
 * eixo nenhum.
 */
export function resolveSubscriptionMonthlyAmountCents(
  subscription: { monthlyLessons?: number | null; weeklyFrequency: number },
  currency: Currency = 'USD',
): number {
  const lessons = subscription.monthlyLessons;
  if (lessons != null) {
    return calculateMonthlyLessonsAmountCents(normalizeMonthlyLessons(lessons), currency);
  }
  return calculateSubscriptionMonthlyAmountCents(subscription.weeklyFrequency, currency);
}

/**
 * Coage um volume mensal persistido para o catalogo publicado (10 ou 20).
 * Valor fora do catalogo cai no plano de entrada em vez de virar preco inventado
 * — `monthlyPackageType` aplica a mesma regra.
 */
export function normalizeMonthlyLessons(lessons: number): MonthlyLessonsPlan {
  return lessons === 20 ? 20 : 10;
}

/**
 * Cadencia semanal equivalente a um volume mensal contratado.
 *
 * Serve APENAS para manter a coluna legada `weeklyFrequency` (NOT NULL) coerente
 * quando a assinatura foi vendida no eixo mensal. Nao precifica e nao concede
 * credito: nesses dois pontos quem manda e `monthlyLessons`.
 */
export function legacyWeeklyEquivalent(monthlyLessons: number): number {
  const weekly = Math.round(monthlyLessons / LEGACY_WEEKS_PER_MONTH_CREDITS);
  return Math.min(5, Math.max(1, weekly));
}

export function stripeCurrencyToCurrency(currency: string | null | undefined): Currency {
  const normalized = (currency ?? 'usd').toUpperCase();
  return isSupportedCurrency(normalized) ? normalized : 'USD';
}
