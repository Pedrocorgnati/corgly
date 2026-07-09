'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/currency';
import { useUserCurrency } from '@/lib/hooks/use-user-currency';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';

const CHARGE_CURRENCY_URL = API.BILLING_CHARGE_CURRENCY;

interface CurrencySelectorProps {
  /** Moedas disponiveis para selecao. Default: todas as suportadas. */
  available?: readonly Currency[];
  className?: string;
  /** Persistir preferencia no servidor alem do localStorage. Default: true. */
  persist?: boolean;
}

const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD $',
  BRL: 'BRL R$',
  EUR: 'EUR €',
  USDC: 'USDC',
};

/**
 * Seletor de moeda de exibicao/cobranca (ADR-0006 §2).
 *
 * - Exibe apenas as moedas passadas em `available` (default: todas as 4 suportadas).
 * - Usa `useUserCurrency` para ler/gravar a preferencia no localStorage.
 * - Quando `persist=true` (default), chama PATCH /api/v1/billing/charge-currency
 *   para persistir no servidor tambem.
 * - USDC e exibido quando presente em `available`; a nota de disponibilidade
 *   condicional fica no tooltip/disclaimer, nao oculta o botao.
 * - Nenhuma promessa de que a cobranca sera feita nessa moeda (Zero Assumido):
 *   a moeda de registro efetiva e confirmada no checkout por `resolveChargeCurrency`.
 */
export function CurrencySelector({
  available = SUPPORTED_CURRENCIES,
  className,
  persist = true,
}: CurrencySelectorProps) {
  const { currency, setCurrency } = useUserCurrency();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Currency) {
    if (next === currency) return;
    setCurrency(next);

    if (!persist) return;

    startTransition(async () => {
      try {
        await apiClient.patch(CHARGE_CURRENCY_URL, {
          currency: next,
        });
      } catch {
        toast.error('Nao foi possivel salvar sua preferencia de moeda. Tente novamente.');
      }
    });
  }

  return (
    <div
      role="group"
      aria-label="Selecionar moeda"
      className={cn('flex flex-wrap gap-2', className)}
    >
      {available.map((c) => {
        const isSelected = c === currency;
        return (
          <button
            key={c}
            type="button"
            onClick={() => handleSelect(c)}
            disabled={isPending}
            aria-pressed={isSelected}
            aria-label={`Selecionar ${c}`}
            className={cn(
              'inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            {CURRENCY_LABELS[c]}
          </button>
        );
      })}
      {persist && (
        <p className="w-full text-xs text-muted-foreground mt-1">
          Preferencia salva. A moeda de registro efetiva e confirmada no checkout.
          {available.includes('USDC') && ' USDC disponivel conforme suporte do gateway.'}
        </p>
      )}
    </div>
  );
}
