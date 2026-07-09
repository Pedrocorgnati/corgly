import type { Currency } from '@/lib/currency';
import { getRegionalDisplay } from '@/lib/billing/currency-policy';

interface PriceDisplayProps {
  amountCents: number;
  currency: Currency;
  locale: string;
  className?: string;
}

/**
 * Renderiza um preco formatado via a politica unica de exibicao regional
 * (`getRegionalDisplay`, ADR-0006 §3). Admin e checkout consomem a MESMA
 * funcao — nunca formatam moeda por conta propria.
 * Valores em centavos — consistente com Stripe (unit_amount) e Prisma (Payment.amount).
 */
export function PriceDisplay({
  amountCents,
  currency,
  locale,
  className,
}: PriceDisplayProps) {
  const { formatted } = getRegionalDisplay(amountCents, currency, locale);
  return (
    <span className={className} data-currency={currency}>
      {formatted}
    </span>
  );
}
