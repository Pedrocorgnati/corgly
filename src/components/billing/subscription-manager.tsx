'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { ROUTES } from '@/lib/constants/routes';
import { SubscriptionStatus } from '@/lib/constants/enums';
import {
  resolveMonthlyCredits,
  resolveSubscriptionMonthlyAmountCents,
} from '@/lib/billing/subscription-pricing';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/**
 * Status persistido -> chave de traducao. Cobre os cinco valores do enum
 * `SubscriptionStatus`; status desconhecido cai no proprio valor cru (visivel,
 * nunca silencioso) com variante neutra.
 */
const STATUS_KEYS: Record<string, { key: string; variant: StatusVariant }> = {
  [SubscriptionStatus.ACTIVE]: { key: 'active', variant: 'default' },
  [SubscriptionStatus.TRIAL]: { key: 'trial', variant: 'secondary' },
  [SubscriptionStatus.CANCELLED]: { key: 'cancelled', variant: 'destructive' },
  [SubscriptionStatus.PAST_DUE]: { key: 'pastDue', variant: 'secondary' },
  [SubscriptionStatus.PAUSED]: { key: 'paused', variant: 'outline' },
};

/**
 * Traducao obrigatoria: chave ausente e DEFEITO, nao texto opcional.
 * Em desenvolvimento estoura no primeiro render; em producao devolve string
 * vazia — a chave crua NUNCA aparece para o usuario final.
 *
 * DUPLICADO nos outros arquivos deste work package: um modulo compartilhado
 * ficaria fora da lista de arquivos de propriedade.
 */
function missingMessage(fullKey: string): string {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[i18n] chave de traducao ausente: ${fullKey}`);
  }
  return '';
}

/**
 * Painel da assinatura ativa.
 *
 * Exibe o plano pelo eixo em que ele foi contratado: `monthlyLessons` (canonico,
 * "N aulas por mes") quando a assinatura tem volume mensal, e a cadencia semanal
 * legada ("Nx por semana") quando nao tem. Preco e creditos saem de
 * `subscription-pricing.ts` — nao ha aritmetica de preco nem de cambio aqui.
 */
export function SubscriptionManager() {
  const t = useTranslations('credits.subscription');
  const locale = useLocale();
  const text = (key: string, values?: Record<string, string | number>): string =>
    t.has(key) ? t(key, values) : missingMessage(`credits.subscription.${key}`);

  const { subscription, isLoading, error, isCancelling, refetch, cancel } = useSubscription();
  const [showCancelModal, setShowCancelModal] = useState(false);

  const formatDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const handleCancel = async () => {
    try {
      await cancel();
      setShowCancelModal(false);
    } catch {
      // Toast de erro ja emitido pelo hook; o modal segue aberto para retry.
    }
  };

  if (isLoading) {
    return (
      <div data-testid="subscription-loading" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState data-testid="subscription-error" message={error} onRetry={refetch} />;
  }

  if (!subscription) {
    return (
      <EmptyState
        data-testid="subscription-empty"
        icon={CalendarClock}
        title={text('empty')}
        description={text('emptyDesc')}
        actionLabel={text('emptyAction')}
        actionHref={ROUTES.CREDITS}
      />
    );
  }

  const status = STATUS_KEYS[subscription.status];
  const statusLabel = status ? text(status.key) : subscription.status;
  const statusVariant: StatusVariant = status?.variant ?? 'secondary';

  // Eixo canonico vence o legado — mesma regra de `resolveMonthlyCredits`.
  const planLabel =
    subscription.monthlyLessons != null
      ? text('lessonsPerMonth', { count: subscription.monthlyLessons })
      : text('perWeek', { count: subscription.weeklyFrequency });

  // Tabela unica de precos (`src/lib/pricing/config.ts`) via subscription-pricing.
  // A assinatura persistida nao guarda moeda de cobranca, entao o valor sai em
  // USD e o texto abaixo diz explicitamente que e referencia.
  const monthlyAmountCents = resolveSubscriptionMonthlyAmountCents(subscription, 'USD');
  const monthlyCredits = resolveMonthlyCredits(subscription);
  const isActive =
    subscription.status === SubscriptionStatus.ACTIVE && !subscription.cancelAtPeriodEnd;

  return (
    <div data-testid="subscription-manager" className="space-y-4">
      <div data-testid="subscription-card" className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 data-testid="subscription-plan-title" className="text-base font-semibold text-foreground">
              {text('title')} — {planLabel}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-baseline gap-0.5">
              <PriceDisplay
                amountCents={monthlyAmountCents}
                currency="USD"
                locale={locale}
                className="font-medium text-foreground"
              />
              <span>{text('perMonth')}</span>
            </p>
          </div>
          <Badge data-testid="subscription-status-badge" variant={statusVariant}>
            {statusLabel}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">{text('periodLabel')}</p>
            {/* Fim do periodo dito pelo que vai acontecer nele: renova ou encerra. */}
            <p data-testid="subscription-period-end" className="text-foreground font-medium">
              {subscription.cancelAtPeriodEnd
                ? text('endsAt', { date: formatDate(subscription.currentPeriodEnd) })
                : text('renewsAt', { date: formatDate(subscription.currentPeriodEnd) })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{text('planLabel')}</p>
            <p data-testid="subscription-plan-axis" className="text-foreground font-medium">
              {planLabel}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{text('creditsLabel')}</p>
            <p data-testid="subscription-monthly-credits" className="text-foreground font-medium">
              {text('creditsPerMonth', { count: monthlyCredits })}
            </p>
          </div>
        </div>

        <p data-testid="subscription-price-note" className="mt-3 text-xs text-muted-foreground">
          {text('priceNote')}
        </p>

        {subscription.cancelAtPeriodEnd && (
          <div
            data-testid="subscription-cancel-notice"
            className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {text('cancelNotice', { date: formatDate(subscription.currentPeriodEnd) })}
          </div>
        )}
      </div>

      {isActive && (
        <div data-testid="subscription-actions" className="flex flex-col sm:flex-row gap-3">
          <Link
            data-testid="subscription-change-plan-link"
            href={ROUTES.BILLING_SUBSCRIPTION_CHANGE}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-h-[44px] flex-1')}
          >
            {text('changePlan')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Button
            data-testid="subscription-cancel-button"
            variant="destructive"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setShowCancelModal(true)}
          >
            {text('cancel')}
          </Button>
        </div>
      )}

      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancel}
        title={text('cancelTitle')}
        message={text('cancelMsgDated', { date: formatDate(subscription.currentPeriodEnd) })}
        confirmText={isCancelling ? text('cancelling') : text('cancelConfirm')}
        cancelText={text('cancelKeep')}
        dangerLevel="high"
        confirmTestId="modal-cancel-subscription-confirm-button"
        cancelTestId="modal-cancel-subscription-cancel-button"
        isLoading={isCancelling}
      />
    </div>
  );
}
