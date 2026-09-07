'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  calculateMonthlyLessonsAmountCents,
  calculateSubscriptionMonthlyAmountCents,
  normalizeMonthlyLessons,
  stripeCurrencyToCurrency,
} from '@/lib/billing/subscription-pricing';
import { API, ROUTES } from '@/lib/constants/routes';
import { missingMessage } from '@/lib/i18n/message-fallback';
import { cn } from '@/lib/utils';
import { useSubscription, type SubscriptionUpdatePayload } from '@/hooks/useSubscription';
import type { Currency } from '@/lib/currency';
import type { MonthlyLessonsPlan } from '@/schemas/checkout.schema';
// Contrato do preview importado como TIPO do proprio produtor
// (`previewSubscriptionChange`), para nao existir uma copia local que envelhece.
// `import type` e apagado na compilacao, entao o `server-only` do modulo nao
// chega ao bundle do cliente.
import type { SubscriptionChangePreview } from '@/lib/billing/subscription-preview.service';

/** Volumes mensais publicados (mesma vitrine da landing e do dashboard). */
const MONTHLY_PLAN_OPTIONS: readonly MonthlyLessonsPlan[] = [10, 20];

/** Cadencias semanais aceitas pelo endpoint legado (1..5). */
const WEEKLY_PLAN_OPTIONS: readonly number[] = [1, 2, 3, 4, 5];

interface ApiResponse<T> {
  data: T;
  error?: string | null;
  message?: string | null;
}

/**
 * Selecao de plano nos DOIS eixos aceitos pela API. Sempre exatamente um eixo:
 * `POST /api/v1/subscriptions/update` e o preview recusam os dois juntos.
 */
type PlanSelection =
  | { axis: 'monthly'; monthlyLessons: MonthlyLessonsPlan }
  | { axis: 'weekly'; weeklyFrequency: number };

function toRequestBody(selection: PlanSelection): SubscriptionUpdatePayload {
  return selection.axis === 'monthly'
    ? { monthlyLessons: selection.monthlyLessons }
    : { weeklyFrequency: selection.weeklyFrequency };
}

/**
 * Valor mensal da opcao pela tabela unica de precos, JA na moeda de cobranca da
 * assinatura. A moeda e obrigatoria de proposito: fixar `'USD'` aqui era o
 * defeito — um aluno brasileiro escolhia "20 aulas por mes" lendo "US$ 300,00"
 * e era debitado em R$ 1.500,00.
 */
function optionAmountCents(selection: PlanSelection, currency: Currency): number {
  return selection.axis === 'monthly'
    ? calculateMonthlyLessonsAmountCents(selection.monthlyLessons, currency)
    : calculateSubscriptionMonthlyAmountCents(selection.weeklyFrequency, currency);
}

/** Estados distintos da resolucao da moeda de cobranca. Nunca implicito. */
type ChargeCurrencyState = 'loading' | 'ready' | 'unavailable';

/**
 * Desfecho de UMA consulta de moeda, carimbado com a consulta que o produziu.
 * O carimbo impede a resposta de uma tentativa anterior de rotular os precos da
 * atual: mudou a chave, o desfecho antigo deixa de valer e a tela volta sozinha
 * para `loading`, sem setState sincrono dentro do efeito.
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
 * valores zerados — e o campo `currency`, o unico que interessa aqui, sai de
 * `subscriptionItem.price.currency`, a moeda em que o Stripe cobra.
 */
function currentPlanPreviewBody(subscription: {
  monthlyLessons: number | null;
  weeklyFrequency: number;
}): SubscriptionUpdatePayload {
  return subscription.monthlyLessons != null
    ? { monthlyLessons: normalizeMonthlyLessons(subscription.monthlyLessons) }
    : { weeklyFrequency: subscription.weeklyFrequency };
}

function isSameSelection(a: PlanSelection, b: PlanSelection): boolean {
  if (a.axis !== b.axis) return false;
  return a.axis === 'monthly' && b.axis === 'monthly'
    ? a.monthlyLessons === b.monthlyLessons
    : a.axis === 'weekly' && b.axis === 'weekly'
      ? a.weeklyFrequency === b.weeklyFrequency
      : false;
}

/**
 * O preview so vale para a opcao que o usuario esta vendo selecionada: trocar a
 * selecao invalida o painel (e o botao de confirmar) em vez de confirmar numeros
 * de outra simulacao.
 */
function previewMatchesSelection(
  preview: SubscriptionChangePreview | null,
  selection: PlanSelection | null,
): boolean {
  if (!preview || !selection) return false;
  if (selection.axis === 'monthly') {
    return preview.requestedMonthlyLessons === selection.monthlyLessons;
  }
  return (
    preview.requestedMonthlyLessons === null &&
    preview.requestedWeeklyFrequency === selection.weeklyFrequency
  );
}

export default function ChangeSubscriptionPlanPage() {
  const router = useRouter();
  const t = useTranslations('credits.subscription');
  const locale = useLocale();
  const text = (key: string, values?: Record<string, string | number>): string =>
    t.has(key) ? t(key, values) : missingMessage(`credits.subscription.${key}`, 'ChangePlanPage');

  const { subscription, isLoading, error, refetch, updatePlan, isUpdating } = useSubscription();
  const [selection, setSelection] = useState<PlanSelection | null>(null);
  const [preview, setPreview] = useState<SubscriptionChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Moeda REAL da cobranca. `model Subscription` nao tem coluna `currency` e
  // `GET /api/v1/subscriptions` devolve o registro cru, entao a moeda vem de
  // onde ela de fato existe: o item da assinatura no Stripe, exposto pelo
  // preview do plano vigente. Enquanto nao chega, os cartoes NAO exibem preco.
  const [currencyResult, setCurrencyResult] = useState<ChargeCurrencyResult | null>(null);
  const [currencyAttempt, setCurrencyAttempt] = useState(0);

  const subscriptionId = subscription?.id ?? null;
  const subscriptionMonthlyLessons = subscription?.monthlyLessons ?? null;
  const subscriptionWeeklyFrequency = subscription?.weeklyFrequency ?? null;

  // Identidade da consulta em curso: assinatura, eixo contratado e tentativa.
  // `null` enquanto a assinatura nao chegou — nao ha o que consultar.
  const currencyKey =
    subscriptionId === null || subscriptionWeeklyFrequency === null
      ? null
      : `${subscriptionId}|${subscriptionMonthlyLessons ?? 'legacy'}|${subscriptionWeeklyFrequency}|${currencyAttempt}`;

  // Estado DERIVADO: sem desfecho carimbado com a chave atual, esta carregando.
  const settledCurrency =
    currencyResult !== null && currencyResult.key === currencyKey ? currencyResult : null;
  const currencyState: ChargeCurrencyState = settledCurrency?.state ?? 'loading';
  const chargeCurrency: Currency | null =
    settledCurrency?.state === 'ready' ? settledCurrency.currency : null;

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
        // Assinatura PAST_DUE responde 404 (`PAYMENT_080` so aceita
        // ACTIVE/TRIAL) e queda de rede responde outra coisa: nos dois casos o
        // desfecho e o mesmo — moeda desconhecida, preco oculto, retry visivel.
        setCurrencyResult({ key: currencyKey, state: 'unavailable' });
      });

    return () => {
      cancelled = true;
    };
  }, [currencyKey, subscriptionMonthlyLessons, subscriptionWeeklyFrequency]);

  const retryCurrency = useCallback(() => {
    setCurrencyAttempt((attempt) => attempt + 1);
  }, []);

  /** Plano vigente traduzido para os mesmos eixos das opcoes da tela. */
  const currentSelection: PlanSelection | null = subscription
    ? subscription.monthlyLessons != null
      ? { axis: 'monthly', monthlyLessons: normalizeMonthlyLessons(subscription.monthlyLessons) }
      : { axis: 'weekly', weeklyFrequency: subscription.weeklyFrequency }
    : null;

  // Sem escolha explicita, a tela abre no plano atual (nunca num plano inventado).
  const activeSelection = selection ?? currentSelection;

  /**
   * A cadencia semanal so aparece para quem ja esta nela. Oferecer o eixo legado
   * a uma assinatura mensal empurraria o aluno de volta para a tabela antiga de
   * preco (US$ 16/aula x 4,33 semanas), que nao e mais vendida.
   */
  const showLegacyOptions = subscription?.monthlyLessons == null;

  const previewMatches = previewMatchesSelection(preview, activeSelection);
  const selectedIsCurrent =
    activeSelection != null &&
    currentSelection != null &&
    isSameSelection(activeSelection, currentSelection);
  const canConfirm =
    previewMatches &&
    preview?.changeType !== 'current_plan' &&
    !isPreviewing &&
    !isConfirming &&
    !isUpdating;

  const planLabel = (monthlyLessons: number | null, weeklyFrequency: number): string =>
    monthlyLessons != null
      ? text('lessonsPerMonth', { count: monthlyLessons })
      : text('perWeek', { count: weeklyFrequency });

  const selectionLabel = (option: PlanSelection): string =>
    option.axis === 'monthly'
      ? text('lessonsPerMonth', { count: option.monthlyLessons })
      : text('perWeek', { count: option.weeklyFrequency });

  const formatDateTime = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  function handleSelect(option: PlanSelection) {
    setSelection(option);
    // Preview antigo nao vale para outra opcao: some junto com a troca.
    setPreview(null);
    setPreviewError(null);
  }

  async function handlePreview() {
    if (!activeSelection) return;

    setPreviewError(null);
    setIsPreviewing(true);

    try {
      const response = await apiClient.post<ApiResponse<SubscriptionChangePreview>>(
        API.BILLING_SUBSCRIPTION_PREVIEW_CHANGE,
        toRequestBody(activeSelection),
      );
      setPreview(response.data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : text('changePreviewError');
      setPreview(null);
      setPreviewError(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!preview || !canConfirm) return;

    setIsConfirming(true);
    try {
      // Corpo montado pelo proprio preview: carrega o eixo pedido e a
      // `prorationDate` daquela simulacao, entao a cobranca confirmada e
      // exatamente a que foi exibida.
      await updatePlan(preview.previewPayload);
      router.push(ROUTES.BILLING_SUBSCRIPTION);
      router.refresh();
    } catch {
      // Toast de erro ja emitido pelo hook; a tela continua com o preview.
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <PageWrapper data-testid="page-billing-subscription-change-plan" className="max-w-4xl">
        <div data-testid="billing-change-plan-loading" className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper data-testid="page-billing-subscription-change-plan" className="max-w-4xl">
        <ErrorState data-testid="billing-change-plan-error" message={error} onRetry={refetch} />
      </PageWrapper>
    );
  }

  if (!subscription || !activeSelection) {
    return (
      <PageWrapper data-testid="page-billing-subscription-change-plan" className="max-w-4xl">
        <EmptyState
          data-testid="billing-change-plan-empty"
          icon={Calculator}
          title={text('empty')}
          description={text('emptyDesc')}
          actionLabel={text('emptyAction')}
          actionHref={ROUTES.CREDITS}
        />
      </PageWrapper>
    );
  }

  const renderOption = (option: PlanSelection, testId: string) => {
    const isSelected = isSameSelection(activeSelection, option);
    const isCurrent = currentSelection != null && isSameSelection(currentSelection, option);

    return (
      <button
        key={testId}
        data-testid={testId}
        type="button"
        onClick={() => handleSelect(option)}
        className={cn(
          'min-h-[92px] rounded-lg border p-4 text-left transition-colors',
          isSelected ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted',
        )}
        aria-pressed={isSelected}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-foreground">
            {selectionLabel(option)}
          </span>
          {isCurrent && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {text('changeCurrentBadge')}
            </span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap items-baseline gap-1 text-sm text-muted-foreground">
          {currencyState === 'loading' && (
            <>
              <Skeleton className="h-4 w-20" />
              <span className="sr-only">{text('currencyLoading')}</span>
            </>
          )}
          {currencyState === 'ready' && chargeCurrency !== null && (
            <>
              <PriceDisplay
                amountCents={optionAmountCents(option, chargeCurrency)}
                currency={chargeCurrency}
                locale={locale}
              />
              <span>{text('changeEstimated')}</span>
            </>
          )}
          {currencyState === 'unavailable' && <span>{text('currencyUnavailable')}</span>}
        </span>
      </button>
    );
  };

  // Moeda do painel de simulacao: sai do proprio preview, que a devolve do item
  // da assinatura no Stripe. Sem preview nao ha painel, entao nao existe
  // fallback de moeda aqui — fallback seria um numero rotulado por adivinhacao.
  const previewCurrency: Currency | null = preview
    ? stripeCurrencyToCurrency(preview.currency)
    : null;

  return (
    <PageWrapper data-testid="page-billing-subscription-change-plan" className="max-w-4xl">
      <div data-testid="billing-change-plan-header" className="mb-6">
        <Link
          href={ROUTES.BILLING_SUBSCRIPTION}
          data-testid="billing-change-plan-back-link"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {text('changeBack')}
        </Link>

        <div className="flex items-start gap-3">
          <Calculator className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{text('changePlan')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{text('changeSubtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section data-testid="billing-change-plan-list" className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">{text('changeChooseTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text('changeCurrentPlan', {
                plan: planLabel(subscription.monthlyLessons, subscription.weeklyFrequency),
              })}
            </p>
          </div>

          <h3 className="mb-2 text-sm font-medium text-foreground">{text('changeMonthlyGroup')}</h3>
          <div data-testid="billing-change-plan-monthly-options" className="grid gap-3 sm:grid-cols-2">
            {MONTHLY_PLAN_OPTIONS.map((lessons) =>
              renderOption(
                { axis: 'monthly', monthlyLessons: lessons },
                `billing-change-plan-monthly-${lessons}`,
              ),
            )}
          </div>

          {showLegacyOptions && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-medium text-foreground">
                {text('changeLegacyGroup')}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">{text('changeLegacyHint')}</p>
              <div data-testid="billing-change-plan-weekly-options" className="grid gap-3 sm:grid-cols-2">
                {WEEKLY_PLAN_OPTIONS.map((frequency) =>
                  renderOption(
                    { axis: 'weekly', weeklyFrequency: frequency },
                    `billing-change-plan-plan-${frequency}`,
                  ),
                )}
              </div>
            </>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              data-testid="billing-change-plan-preview-button"
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing}
              className="min-h-[44px]"
              aria-busy={isPreviewing}
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {text('changePreviewLoading')}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {text('changePreviewCta')}
                </>
              )}
            </Button>

            <button
              data-testid="billing-change-plan-confirm-button"
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-[44px]')}
              aria-busy={isConfirming}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {text('changeConfirmLoading')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {text('changeConfirmCta')}
                </>
              )}
            </button>
          </div>

          {selectedIsCurrent && (
            <p data-testid="billing-change-plan-current-note" className="mt-3 text-sm text-muted-foreground">
              {text('changeSelectedIsCurrent')}
            </p>
          )}

          {currencyState === 'unavailable' && (
            <div
              data-testid="billing-change-plan-currency-error"
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <span>{text('currencyUnavailable')}</span>
              <Button
                data-testid="billing-change-plan-currency-retry-button"
                type="button"
                variant="outline"
                size="sm"
                onClick={retryCurrency}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {text('currencyRetry')}
              </Button>
            </div>
          )}

          {previewError && (
            <div
              data-testid="billing-change-plan-preview-error"
              role="alert"
              className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {previewError}
            </div>
          )}
        </section>

        <aside data-testid="billing-change-plan-preview-panel" className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{text('changePreviewTitle')}</h2>

          {!previewMatches && (
            <p className="mt-3 text-sm text-muted-foreground">{text('changePreviewHint')}</p>
          )}

          {previewMatches && preview && previewCurrency !== null && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{text('changeSummaryLabel')}</p>
                <p data-testid="billing-change-plan-summary" className="text-base font-semibold text-foreground">
                  {text('changeSummaryValue', {
                    from: planLabel(preview.currentMonthlyLessons, preview.currentWeeklyFrequency),
                    to: planLabel(preview.requestedMonthlyLessons, preview.requestedWeeklyFrequency),
                  })}
                </p>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text('changeNextMonthly')}</dt>
                  <dd className="font-medium text-foreground">
                    <PriceDisplay
                      amountCents={preview.nextMonthlyAmountCents}
                      currency={previewCurrency}
                      locale={locale}
                    />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text('changeProration')}</dt>
                  <dd className="font-medium text-foreground">
                    <PriceDisplay
                      amountCents={preview.prorationAmountCents}
                      currency={previewCurrency}
                      locale={locale}
                    />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text('changeTax')}</dt>
                  <dd className="font-medium text-foreground">
                    <PriceDisplay
                      amountCents={preview.estimatedTaxCents}
                      currency={previewCurrency}
                      locale={locale}
                    />
                  </dd>
                </div>
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{text('changeDueNow')}</dt>
                    <dd data-testid="billing-change-plan-due-now" className="text-lg font-semibold text-foreground">
                      <PriceDisplay
                        amountCents={preview.amountDueNowCents}
                        currency={previewCurrency}
                        locale={locale}
                      />
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {text('changeEffective', {
                  effectiveAt: formatDateTime(preview.effectiveAt),
                  periodEnd: formatDateTime(preview.currentPeriodEnd),
                })}
              </div>

              {preview.changeType === 'current_plan' && (
                <p className="text-sm text-muted-foreground">{text('changeCurrentPlanNotice')}</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </PageWrapper>
  );
}
