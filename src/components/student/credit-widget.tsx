'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
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

export function CreditWidget({ balance, expiringCount = 0, expiringDays = 0 }: CreditWidgetProps) {
  // A pluralizacao mora no CATALOGO (ICU `plural`), nao mais num helper local em
  // portugues: cada idioma tem as suas formas e o antigo `plural(n, 'crédito',
  // 'créditos')` escrevia portugues mesmo com o site em ingles. O ICU tambem
  // acerta o caso do zero, que o `> 1` original errava.
  const t = useTranslations('dashboard.credits');

  const isEmpty = balance === 0;
  const isExpiring = expiringCount > 0;
  // O produtor (dashboard) so alerta para lote com `expiresAt` no futuro, entao
  // o piso de 1 dia e defesa contra "expira em 0 dias" vindo de arredondamento.
  const daysLabel = Math.max(1, Math.ceil(expiringDays));

  return (
    <WidgetCard
      data-testid="dashboard-kpi-credits"
      title={t('title')}
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
          {t('unit', { count: balance })}
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
            {t('expiring', { count: expiringCount, days: daysLabel })}
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
        {isEmpty ? t('buy') : t('buyMore')}
      </Link>
    </WidgetCard>
  );
}
