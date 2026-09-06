/**
 * Pricing multi-moeda para pacotes de credito e assinatura.
 *
 * ESTA E A UNICA TABELA DE CAMBIO DO PRODUTO. Componentes, paginas e services
 * NUNCA reimplementam conversao de moeda: `src/lib/billing/currency-policy.ts`
 * proibe explicitamente reimplementar cambio fora do modulo canonico, e o preco
 * cobrado sai sempre daqui via `resolvePrice`.
 *
 * Convencao de precos:
 *   - `amountCents`: fallback (usado em `price_data.unit_amount` quando nao ha priceId).
 *   - `priceId`: Stripe Price ID pre-cadastrado (preferido em producao — gera recibo correto).
 *
 * Criacao dos priceIds Stripe: documentar em PENDING-ACTIONS.md.
 * Ate configurar priceId, o checkout cai no `price_data` com a conversao
 * aproximada abaixo.
 */

import type { Currency } from '@/lib/currency';

/**
 * Pacotes precificaveis.
 *
 * Vitrine publica (landing + dashboard): SINGLE, PACK_10, MONTHLY_10, MONTHLY_20
 * (PROMO e a primeira aula, aplicada automaticamente quando `isFirstPurchase`).
 *
 * PACK_5 saiu da vitrine mas CONTINUA suportado aqui, em PACKAGE_CREDITS e no
 * enum de lote de credito, para nao quebrar compras/creditos ja existentes.
 */
export type PackageType =
  | 'SINGLE'
  | 'PACK_5'
  | 'PACK_10'
  | 'PROMO'
  | 'MONTHLY_10'
  | 'MONTHLY_20';

/** Pacotes de assinatura mensal, indexados pelo volume mensal contratado. */
export type MonthlyPackageType = 'MONTHLY_10' | 'MONTHLY_20';

export interface PricePoint {
  amountCents: number;
  priceId?: string;
}

type PricingMap = Record<PackageType, Record<Currency, PricePoint>>;

/**
 * Precos em centavos da moeda nativa (Stripe usa inteiros).
 *
 * Os valores USD sao derivados de `src/lib/constants/landing.ts` (fonte publica
 * unica de preco): SINGLE = SINGLE_USD (25), PACK_10 = PACK10_USD (190),
 * PROMO = FIRST_LESSON_USD (12,50), MONTHLY_10 = monthlyTotalUsd(10) (10 x 17 =
 * 170) e MONTHLY_20 = monthlyTotalUsd(20) (20 x 15 = 300). A trava contra drift
 * entre landing e checkout e o teste `src/lib/pricing/__tests__/pricing-parity.test.ts`.
 *
 * Taxas de conversao (arredondando para cima em centavos):
 *   USDC: 1:1 com USD.
 *   EUR:  0,92 x USD.
 *   BRL:  5,0 x USD — conferir com owner antes de go-live.
 */
export const PRICING: PricingMap = {
  SINGLE: {
    USD: { amountCents: 2500, priceId: process.env.STRIPE_PRICE_SINGLE_USD },
    BRL: { amountCents: 12500, priceId: process.env.STRIPE_PRICE_SINGLE_BRL },
    EUR: { amountCents: 2300, priceId: process.env.STRIPE_PRICE_SINGLE_EUR },
    USDC: { amountCents: 2500, priceId: process.env.STRIPE_PRICE_SINGLE_USDC },
  },
  // Fora da vitrine desde a paridade com a landing; mantido para dados legados.
  PACK_5: {
    USD: { amountCents: 11000, priceId: process.env.STRIPE_PRICE_PACK5_USD },
    BRL: { amountCents: 55000, priceId: process.env.STRIPE_PRICE_PACK5_BRL },
    EUR: { amountCents: 10120, priceId: process.env.STRIPE_PRICE_PACK5_EUR },
    USDC: { amountCents: 11000, priceId: process.env.STRIPE_PRICE_PACK5_USDC },
  },
  PACK_10: {
    USD: { amountCents: 19000, priceId: process.env.STRIPE_PRICE_PACK10_USD },
    BRL: { amountCents: 95000, priceId: process.env.STRIPE_PRICE_PACK10_BRL },
    EUR: { amountCents: 17480, priceId: process.env.STRIPE_PRICE_PACK10_EUR },
    USDC: { amountCents: 19000, priceId: process.env.STRIPE_PRICE_PACK10_USDC },
  },
  PROMO: {
    USD: { amountCents: 1250, priceId: process.env.STRIPE_PRICE_PROMO_USD },
    BRL: { amountCents: 6250, priceId: process.env.STRIPE_PRICE_PROMO_BRL },
    EUR: { amountCents: 1150, priceId: process.env.STRIPE_PRICE_PROMO_EUR },
    USDC: { amountCents: 1250, priceId: process.env.STRIPE_PRICE_PROMO_USDC },
  },
  // Assinatura mensal — 10 aulas/mes a US$ 17 (MONTHLY_OPTIONS[0] da landing).
  MONTHLY_10: {
    USD: { amountCents: 17000, priceId: process.env.STRIPE_PRICE_MONTHLY10_USD },
    BRL: { amountCents: 85000, priceId: process.env.STRIPE_PRICE_MONTHLY10_BRL },
    EUR: { amountCents: 15640, priceId: process.env.STRIPE_PRICE_MONTHLY10_EUR },
    USDC: { amountCents: 17000, priceId: process.env.STRIPE_PRICE_MONTHLY10_USDC },
  },
  // Assinatura mensal — 20 aulas/mes a US$ 15 (MONTHLY_OPTIONS[1] da landing).
  MONTHLY_20: {
    USD: { amountCents: 30000, priceId: process.env.STRIPE_PRICE_MONTHLY20_USD },
    BRL: { amountCents: 150000, priceId: process.env.STRIPE_PRICE_MONTHLY20_BRL },
    EUR: { amountCents: 27600, priceId: process.env.STRIPE_PRICE_MONTHLY20_EUR },
    USDC: { amountCents: 30000, priceId: process.env.STRIPE_PRICE_MONTHLY20_USDC },
  },
};

/** Volume mensal contratado -> pacote de assinatura correspondente. */
export const MONTHLY_PACKAGE_BY_LESSONS: Record<10 | 20, MonthlyPackageType> = {
  10: 'MONTHLY_10',
  20: 'MONTHLY_20',
};

/**
 * Resolve o pacote de assinatura a partir do volume mensal contratado.
 * Volume nao catalogado cai em MONTHLY_10 (o plano mensal de entrada), nunca
 * em preco inventado.
 */
export function monthlyPackageType(lessons: number): MonthlyPackageType {
  return lessons === 20 ? 'MONTHLY_20' : 'MONTHLY_10';
}

/** Stripe aceita lowercase — normaliza para a API. */
export function toStripeCurrency(c: Currency): string {
  return c === 'USDC' ? 'usd' : c.toLowerCase();
}

export function resolvePrice(
  pkg: PackageType,
  currency: Currency,
): PricePoint {
  return PRICING[pkg][currency];
}
