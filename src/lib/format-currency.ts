/**
 * @module lib/format-currency
 * Formatação de moeda locale-aware — Module 2: Shared Foundations
 *
 * @param amountInCents - Valor em centavos (ex: 2500 = $25.00)
 * @param currency - 'usd' | 'brl' | 'eur' | 'usdc' (default: 'usd')
 * @param locale - BCP 47 locale string (default: 'en-US')
 */

type Currency = 'usd' | 'brl' | 'eur' | 'usdc';

const SUPPORTED_CURRENCIES: Record<Currency, string> = {
  usd: 'USD',
  brl: 'BRL',
  eur: 'EUR',
  usdc: 'USD', // USDC exibe como USD
};

const FALLBACK_CURRENCY = 'USD';
const FALLBACK_LOCALE = 'en-US';

export function formatCurrency(
  amountInCents: number,
  currency: Currency = 'usd',
  locale = FALLBACK_LOCALE,
): string {
  const isoCode = SUPPORTED_CURRENCIES[currency] ?? FALLBACK_CURRENCY;
  const amount = amountInCents / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: isoCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Locale inválido: fallback para en-US
    return new Intl.NumberFormat(FALLBACK_LOCALE, {
      style: 'currency',
      currency: FALLBACK_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

/**
 * Formata valor em centavos para exibição compacta (sem casas decimais se inteiro).
 * @example formatCurrencyCompact(2500, 'usd') → "$25"
 */
export function formatCurrencyCompact(
  amountInCents: number,
  currency: Currency = 'usd',
  locale = FALLBACK_LOCALE,
): string {
  const isoCode = SUPPORTED_CURRENCIES[currency] ?? FALLBACK_CURRENCY;
  const amount = amountInCents / 100;
  const isInteger = amount % 1 === 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: isoCode,
      minimumFractionDigits: isInteger ? 0 : 2,
      maximumFractionDigits: isInteger ? 0 : 2,
    }).format(amount);
  } catch {
    return formatCurrency(amountInCents, currency, FALLBACK_LOCALE);
  }
}
