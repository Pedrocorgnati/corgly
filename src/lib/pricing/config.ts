/**
 * Pricing multi-moeda para pacotes de credito e assinatura.
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

export type PackageType = 'SINGLE' | 'PACK_5' | 'PACK_10' | 'PROMO';

export interface PricePoint {
  amountCents: number;
  priceId?: string;
}

type PricingMap = Record<PackageType, Record<Currency, PricePoint>>;

/**
 * Precos em centavos da moeda nativa (Stripe usa inteiros).
 * BRL: taxa ~5.0x USD — conferir com owner antes de go-live.
 * EUR: taxa ~0.92x USD.
 * USDC: 1:1 com USD.
 */
export const PRICING: PricingMap = {
  SINGLE: {
    USD: { amountCents: 2500, priceId: process.env.STRIPE_PRICE_SINGLE_USD },
    BRL: { amountCents: 12500, priceId: process.env.STRIPE_PRICE_SINGLE_BRL },
    EUR: { amountCents: 2300, priceId: process.env.STRIPE_PRICE_SINGLE_EUR },
    USDC: { amountCents: 2500, priceId: process.env.STRIPE_PRICE_SINGLE_USDC },
  },
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
};

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
