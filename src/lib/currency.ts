/**
 * Helpers multi-moeda — resolve currency a partir de locale e expoe
 * conjunto canonico de moedas suportadas.
 *
 * Formatacao em si fica em `format-currency.ts` (existente) para evitar
 * duplicacao; este arquivo cuida de mapeamento e validacao.
 */

export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR', 'USDC'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

/**
 * Mapeamento locale -> moeda padrao. Fallback USD.
 * Esta e a "currency inferida" quando o usuario nao escolheu explicitamente.
 */
export function localeToCurrency(locale: string | undefined): Currency {
  if (!locale) return 'USD';
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('pt')) return 'BRL';
  if (normalized.startsWith('it')) return 'EUR';
  if (normalized.startsWith('es')) return 'EUR';
  if (normalized.startsWith('en')) return 'USD';
  return 'USD';
}

/**
 * Formata preco em cents para string localizada.
 * USDC e renderizado como USD (Intl nao conhece USDC).
 */
export function formatPrice(
  amountCents: number,
  currency: Currency,
  locale: string,
): string {
  const iso = currency === 'USDC' ? 'USD' : currency;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: iso,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amountCents / 100);
  }
}
