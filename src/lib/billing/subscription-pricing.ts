import type { Currency } from '@/lib/currency';
import { isSupportedCurrency } from '@/lib/currency';
import { convertUsdCents, monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import type { PricePoint } from '@/lib/pricing/config';
import type { MonthlyLessonsPlan } from '@/schemas/checkout.schema';

/**
 * Precificacao de assinatura — dois eixos, uma unica fonte de cambio.
 *
 * Eixo LEGADO (`weeklyFrequency`): preco derivado de US$ 16/aula x 4,33
 * semanas/mes. Continua valendo para as assinaturas criadas antes do eixo
 * mensal; nao mexer nos numeros, ha cobranca viva neles.
 *
 * Eixo CANONICO (`monthlyLessons`): preco vem de `PRICING` em
 * `src/lib/pricing/config.ts`, que ja carrega as 4 moedas.
 *
 * Nenhum dos dois eixos tem tabela de cambio propria: a conversao do eixo
 * legado passa por `convertUsdCents`, do modulo canonico, porque
 * `currency-policy.ts` (linha 10) proibe reimplementar cambio fora dele. A
 * trava esta em `src/lib/billing/__tests__/subscription-pricing.test.ts`.
 */

const WEEKLY_CLASS_PRICE_CENTS = 1600;
const AVERAGE_WEEKS_PER_MONTH = 4.33;

/** Creditos concedidos por mes no eixo legado: cadencia semanal x 4 semanas. */
export const LEGACY_WEEKS_PER_MONTH_CREDITS = 4;

/**
 * Valor mensal do eixo LEGADO por cadencia semanal, ja na moeda de cobranca.
 * A conversao sai da tabela unica (`convertUsdCents`), nunca de taxa local.
 */
export function calculateSubscriptionMonthlyAmountCents(
  weeklyFrequency: number,
  currency: Currency = 'USD',
): number {
  const baseUsdCents = Math.ceil(
    weeklyFrequency * WEEKLY_CLASS_PRICE_CENTS * AVERAGE_WEEKS_PER_MONTH,
  );
  return convertUsdCents(baseUsdCents, currency);
}

/**
 * Ponto de preco do catalogo para o volume mensal contratado: 10 aulas =
 * MONTHLY_10, 20 aulas = MONTHLY_20.
 *
 * Devolve o `PricePoint` inteiro (amountCents + priceId), nao apenas o valor:
 * quem monta o line item do Stripe precisa dos dois para confrontar o Price
 * remoto com o preco canonico ANTES de cobrar (ver `buildGuardedLineItem` em
 * `src/lib/billing/checkout.service.ts`).
 */
export function resolveMonthlyPricePoint(
  lessons: MonthlyLessonsPlan,
  currency: Currency = 'USD',
): PricePoint {
  return resolvePrice(monthlyPackageType(lessons), currency);
}

/**
 * Preco mensal do eixo canonico: 10 aulas = MONTHLY_10, 20 aulas = MONTHLY_20.
 * Delega a `resolvePrice`, que ja resolve a moeda pela tabela unica.
 */
export function calculateMonthlyLessonsAmountCents(
  lessons: MonthlyLessonsPlan,
  currency: Currency = 'USD',
): number {
  return resolveMonthlyPricePoint(lessons, currency).amountCents;
}

/** Eixo de plano de assinatura aceito pelos escritores de metadata do Stripe. */
export type PlanAxis = { monthlyLessons: number } | { weeklyFrequency: number };

/**
 * Metadata de eixo enviada ao Stripe. As DUAS chaves sempre presentes.
 *
 * E `type`, nao `interface`, de proposito: so o alias de tipo ganha assinatura
 * de indice implicita e portanto e atribuivel a `Record<string, string>` e a
 * `Stripe.MetadataParam`, que sao exatamente os alvos deste valor. Trocar por
 * `interface` reintroduz TS2322 em todos os pontos que escrevem metadata.
 */
export type PlanAxisMetadata = {
  monthlyLessons: string;
  weeklyFrequency: string;
};

/**
 * Monta a metadata de eixo de um plano de assinatura para o Stripe.
 *
 * POR QUE AS DUAS CHAVES SEMPRE: a metadata do Stripe e MERGE, nao replace.
 * Enviar so o eixo vigente deixa o eixo anterior vivo no objeto Subscription —
 * uma assinatura legada com `weeklyFrequency=2` migrada para `monthlyLessons=20`
 * ficaria com `{weeklyFrequency:"2", monthlyLessons:"20"}` no Stripe e o webhook
 * `customer.subscription.updated` teria dois eixos para escolher (concedendo 8
 * creditos em vez de 20).
 *
 * COMO A CHAVE INATIVA E APAGADA: string vazia. E o valor documentado pela API
 * do Stripe para remover uma chave de metadata ("Individual keys can be unset by
 * posting an empty value to them", `SubscriptionUpdateParams.metadata`), e o tipo
 * `Stripe.MetadataParam` (`node_modules/stripe/types/shared.d.ts`) aceita
 * `string` — logo `''` e valido em tempo de compilacao e de execucao.
 *
 * O leitor (`readPlanAxis`, em `src/services/stripe.service.ts`) ainda trata o
 * caso de os dois eixos chegarem preenchidos, para nao depender apenas desta
 * limpeza em assinaturas antigas ja corrompidas.
 */
export function buildPlanAxisMetadata(plan: PlanAxis): PlanAxisMetadata {
  return 'monthlyLessons' in plan
    ? { monthlyLessons: String(plan.monthlyLessons), weeklyFrequency: '' }
    : { monthlyLessons: '', weeklyFrequency: String(plan.weeklyFrequency) };
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
