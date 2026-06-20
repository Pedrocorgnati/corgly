import type { Currency } from '@/lib/currency';
import { isSupportedCurrency } from '@/lib/currency';

const WEEKLY_CLASS_PRICE_CENTS = 1600;
const AVERAGE_WEEKS_PER_MONTH = 4.33;

const SUBSCRIPTION_FX: Record<Currency, number> = {
  USD: 1,
  USDC: 1,
  EUR: 0.92,
  BRL: 5,
};

export function calculateSubscriptionMonthlyAmountCents(
  weeklyFrequency: number,
  currency: Currency = 'USD',
): number {
  const baseUsdCents = Math.ceil(
    weeklyFrequency * WEEKLY_CLASS_PRICE_CENTS * AVERAGE_WEEKS_PER_MONTH,
  );
  return Math.ceil(baseUsdCents * SUBSCRIPTION_FX[currency]);
}

export function stripeCurrencyToCurrency(currency: string | null | undefined): Currency {
  const normalized = (currency ?? 'usd').toUpperCase();
  return isSupportedCurrency(normalized) ? normalized : 'USD';
}
