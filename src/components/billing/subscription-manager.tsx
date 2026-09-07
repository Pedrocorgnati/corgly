'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { apiClient } from '@/lib/api-client';
import { API, ROUTES } from '@/lib/constants/routes';
import { SubscriptionStatus } from '@/lib/constants/enums';
import {
  normalizeMonthlyLessons,
  resolveMonthlyCredits,
  resolveSubscriptionMonthlyAmountCents,
  stripeCurrencyToCurrency,
} from '@/lib/billing/subscription-pricing';
import { useSubscription, type SubscriptionUpdatePayload } from '@/hooks/useSubscription';
import type { Currency } from '@/lib/currency';
import { missingMessage } from '@/lib/i18n/message-fallback';
import { cn } from '@/lib/utils';
// Contrato do preview importado como TIPO do proprio produtor, para nao existir
// copia local que envelhece. `import type` some na compilacao, entao o
// `server-only` do modulo nao chega ao bundle do cliente.
import type { SubscriptionChangePreview } from '@/lib/billing/subscription-preview.service';

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

interface ApiResponse<T> {
  data: T;
}

/** Estados distintos da resolucao da moeda de cobranca. Nunca implicito. */
type ChargeCurrencyState = 'loading' | 'ready' | 'unavailable';

/**
 * Desfecho de UMA consulta de moeda, carimbado com a consulta que o produziu.
 * O carimbo e o que impede a resposta de uma assinatura (ou de uma tentativa)
 * anterior de rotular o valor da atual: quando a chave muda, o desfecho antigo
 * deixa de valer e o painel volta sozinho para `loading`.
 */
type ChargeCurrencyResult =
  | { key: string; state: 'ready'; currency: Currency }
  | { key: string; state: 'unavailable' };

/**
 * Corpo do preview do plano VIGENTE, no eixo em que a assinatura foi contratada.
 *
 * Pedir o proprio plano faz `previewSubscriptionChange` classificar a troca como
 * `current_plan` e retornar cedo (`src/lib/billing/subscription-preview.service.ts`):
 * uma unica `subscriptions.retrieve`, nenhuma `invoices.createPreview`, todos os
 * valores zerados — e o campo `currency`, que e o unico que interessa aqui,
 * vem do `subscriptionItem.price.currency`, a moeda em que o Stripe cobra.
 */
function currentPlanPreviewBody(subscription: {
  monthlyLessons: number | null;
  weeklyFrequency: number;
}): SubscriptionUpdatePayload {
  return subscription.monthlyLessons != null
    ? { monthlyLessons: normalizeMonthlyLessons(subscription.monthlyLessons) }
    : { weeklyFrequency: subscription.weeklyFrequency };
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
    t.has(key) ? t(key, values) : missingMessage(`credits.subscription.${key}`, 'SubscriptionManager');

  const { subscription, isLoading, error, isCancelling, refetch, cancel } = useSubscription();
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Moeda REAL da cobranca. Nao existe coluna `currency` em `model Subscription`
  // (`prisma/schema.prisma` linha 603) e `GET /api/v1/subscriptions` devolve o
  // registro cru, entao o dado e buscado onde ele de fato existe: o item da
  // assinatura no Stripe, exposto pelo preview do plano vigente. Enquanto ele
  // nao chega o valor NAO e renderizado — imprimir dolar por omissao era o
  // defeito: um europeu cobrado em 15640 centavos de euro lia "US$ 170,00".
  const [currencyResult, setCurrencyResult] = useState<ChargeCurrencyResult | null>(null);
  const [currencyAttempt, setCurrencyAttempt] = useState(0);

  const subscriptionId = subscription?.id ?? null;
  const subscriptionMonthlyLessons = subscription?.monthlyLessons ?? null;
  const subscriptionWeeklyFrequency = subscription?.weeklyFrequency ?? null;

  // Identidade da consulta em curso: assinatura, eixo contratado e tentativa.
  // `null` quando ainda nao ha assinatura carregada — nao ha o que consultar.
  const currencyKey =
    subscriptionId === null || subscriptionWeeklyFrequency === null
      ? null
      : `${subscriptionId}|${subscriptionMonthlyLessons ?? 'legacy'}|${subscriptionWeeklyFrequency}|${currencyAttempt}`;

  // Estado DERIVADO da consulta corrente: sem desfecho carimbado com a chave
  // atual, o painel esta carregando. Nada de setState sincrono em efeito para
  // "resetar" — o reset e consequencia da chave ter mudado.
  const settled = currencyResult !== null && currencyResult.key === currencyKey ? currencyResult : null;
  const currencyState: ChargeCurrencyState = settled?.state ?? 'loading';
  const chargeCurrency: Currency | null = settled?.state === 'ready' ? settled.currency : null;

  useEffect(() => {
    // A chave nula ja cobre o caso "sem assinatura"; repetir o eixo legado aqui
    // e o que garante ao TypeScript o `number` que o corpo da requisicao exige.
    if (currencyKey === null || subscriptionWeeklyFrequency === null) return;

    let cancelled = false;

    apiClient
      .post<ApiResponse<SubscriptionChangePreview>>(
        API.BILLING_SUBSCRIPTION_PREVIEW_CHANGE,
        currentPlanPreviewBody({
          monthlyLessons: subscriptionMonthlyLessons,
          weeklyFrequency: subscriptionWeeklyFrequency,
        }),
      )
      .then((response) => {
        if (cancelled) return;
        setCurrencyResult({
          key: currencyKey,
          state: 'ready',
          currency: stripeCurrencyToCurrency(response.data.currency),
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Assinatura PAST_DUE responde 404 (`PAYMENT_080`, que so aceita
        // ACTIVE/TRIAL) e queda de rede responde outra coisa: nos dois casos o
        // desfecho para o aluno e o mesmo — moeda desconhecida, valor oculto e
        // um botao para tentar de novo. Nunca um numero em moeda adivinhada.
        setCurrencyResult({ key: currencyKey, state: 'unavailable' });
      });

    return () => {
      cancelled = true;
    };
  }, [currencyKey, subscriptionMonthlyLessons, subscriptionWeeklyFrequency]);

  const retryCurrency = useCallback(() => {
    setCurrencyAttempt((attempt) => attempt + 1);
  }, []);

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
  // Calculo e renderizacao usam a MESMA moeda resolvida do Stripe: o valor nunca
  // e computado numa moeda e rotulado com outra, e so existe quando a moeda
  // existe (`chargeCurrency` nulo => nada renderizado).
  const monthlyAmountCents =
    chargeCurrency !== null
      ? resolveSubscriptionMonthlyAmountCents(subscription, chargeCurrency)
      : null;
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
            {currencyState === 'loading' && (
              <p
                data-testid="subscription-price-loading"
                className="mt-1 flex items-center gap-2"
                aria-busy="true"
              >
                <Skeleton className="h-5 w-24" />
                <span className="sr-only">{text('currencyLoading')}</span>
              </p>
            )}

            {currencyState === 'ready' && chargeCurrency !== null && monthlyAmountCents !== null && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-baseline gap-0.5">
                <PriceDisplay
                  amountCents={monthlyAmountCents}
                  currency={chargeCurrency}
                  locale={locale}
                  className="font-medium text-foreground"
                />
                <span>{text('perMonth')}</span>
              </p>
            )}

            {currencyState === 'unavailable' && (
              <p
                data-testid="subscription-price-unavailable"
                role="alert"
                className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              >
                <span>{text('currencyUnavailable')}</span>
                <Button
                  data-testid="subscription-price-retry-button"
                  variant="outline"
                  size="sm"
                  onClick={retryCurrency}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {text('currencyRetry')}
                </Button>
              </p>
            )}
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

        {currencyState === 'ready' && (
          // A nota antiga (`priceNote`) dizia "valor de referencia em dolar":
          // virou mentira agora que o valor sai na moeda real da cobranca.
          <p data-testid="subscription-price-note" className="mt-3 text-xs text-muted-foreground">
            {text('priceNoteCharged')}
          </p>
        )}

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
