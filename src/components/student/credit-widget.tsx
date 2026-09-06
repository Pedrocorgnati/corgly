'use client';

import Link from 'next/link';
import { AlertTriangle, Coins } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

interface CreditWidgetProps {
  balance: number;
  /** Creditos do lote que expira dentro da janela de alerta. 0 = sem alerta. */
  expiringCount?: number;
  /** Dias inteiros ate a expiracao desse lote (>= 1 quando ha alerta). */
  expiringDays?: number;
}

/**
 * Pluralizacao em pt-BR pelo criterio correto: singular SO no 1.
 * `> 1` (a forma anterior) tratava 0 como singular — "0 crédito expira".
 * Mesma regra de src/components/billing/credit-breakdown.tsx.
 */
function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function CreditWidget({ balance, expiringCount = 0, expiringDays = 0 }: CreditWidgetProps) {
  const isEmpty = balance === 0;
  const isExpiring = expiringCount > 0;
  // O produtor (dashboard) so alerta para lote com `expiresAt` no futuro, entao
  // o piso de 1 dia e defesa contra "expira em 0 dias" vindo de arredondamento.
  const daysLabel = Math.max(1, Math.ceil(expiringDays));

  return (
    <WidgetCard
      data-testid="dashboard-kpi-credits"
      title="Créditos Corgly"
      icon={Coins}
      accent={isEmpty ? 'destructive' : isExpiring ? 'amber' : 'brand'}
      featured={!isEmpty && !isExpiring}
      className={cn(
        isEmpty && 'border-2 border-destructive',
        isExpiring && 'border-2 border-warning',
      )}
    >
      <div className="text-center mb-5">
        {/* Mesmo tratamento do preco na pricing da landing: numero grande em
            tinta navy, legenda em slate. */}
        <p
          className={cn(
            'text-[2.75rem] font-bold tracking-tight leading-none',
            isEmpty ? 'text-destructive' : 'text-ink',
          )}
        >
          {balance}
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {plural(balance, 'crédito', 'créditos')}
        </p>
      </div>

      {isExpiring && (
        <div
          data-testid="dashboard-kpi-credits-expiry-warning"
          role="status"
          className="mb-5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5"
        >
          <p className="text-[13px] text-warning font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {expiringCount} {plural(expiringCount, 'crédito', 'créditos')}{' '}
            {plural(expiringCount, 'expira', 'expiram')} em {daysLabel}{' '}
            {plural(daysLabel, 'dia', 'dias')}
          </p>
        </div>
      )}

      <Link
        href={ROUTES.CREDITS}
        data-testid="dashboard-kpi-credits-buy-button"
        className={cn(
          buttonVariants({ variant: isEmpty ? 'default' : 'outline' }),
          'mt-auto w-full h-11 min-h-[44px] rounded-lg font-semibold',
          !isEmpty && 'border-[1.5px] border-brand-500 text-brand-500 hover:bg-brand-500/5',
        )}
      >
        {isEmpty ? 'Comprar créditos' : 'Comprar mais'}
      </Link>
    </WidgetCard>
  );
}
