import { formatPrice, type Currency } from '@/lib/currency';

interface PriceDisplayProps {
  amountCents: number;
  currency: Currency;
  locale: string;
  className?: string;
}

/**
 * Renderiza um preco formatado via `Intl.NumberFormat`.
 * Valores em centavos — consistente com Stripe (unit_amount) e Prisma (Payment.amount).
 */
export function PriceDisplay({
  amountCents,
  currency,
  locale,
  className,
}: PriceDisplayProps) {
  return (
    <span className={className} data-currency={currency}>
      {formatPrice(amountCents, currency, locale)}
    </span>
  );
}
