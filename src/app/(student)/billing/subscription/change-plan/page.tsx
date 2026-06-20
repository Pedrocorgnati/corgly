'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { apiClient, ApiError } from '@/lib/api-client';
import { calculateSubscriptionMonthlyAmountCents } from '@/lib/billing/subscription-pricing';
import { API, ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5] as const;

interface SubscriptionChangePreview {
  currentWeeklyFrequency: number;
  requestedWeeklyFrequency: number;
  changeType: 'upgrade' | 'downgrade' | 'current_plan';
  currency: string;
  currentMonthlyAmountCents: number;
  nextMonthlyAmountCents: number;
  prorationAmountCents: number;
  estimatedTaxCents: number;
  amountDueNowCents: number;
  effectiveAt: string;
  currentPeriodEnd: string;
  previewPayload: {
    weeklyFrequency: number;
    prorationDate: number;
  };
}

interface ApiResponse<T> {
  data: T;
  error?: string | null;
  message?: string | null;
}

function formatMoney(cents: number, currency: string) {
  const currencyCode = currency.toUpperCase();

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currencyCode} ${(cents / 100).toFixed(2)}`;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `subscription-change-${Date.now()}`;
}

export default function ChangeSubscriptionPlanPage() {
  const router = useRouter();
  const { subscription, isLoading, error, refetch } = useSubscription();
  const [selectedFrequency, setSelectedFrequency] = useState<number>(2);
  const [preview, setPreview] = useState<SubscriptionChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const previewMatchesSelection = preview?.requestedWeeklyFrequency === selectedFrequency;
  const selectedIsCurrent = subscription?.weeklyFrequency === selectedFrequency;
  const canConfirm =
    previewMatchesSelection &&
    preview?.changeType !== 'current_plan' &&
    !isPreviewing &&
    !isConfirming;

  async function handlePreview() {
    setPreviewError(null);
    setIsPreviewing(true);

    try {
      const response = await apiClient.post<ApiResponse<SubscriptionChangePreview>>(
        API.BILLING_SUBSCRIPTION_PREVIEW_CHANGE,
        { weeklyFrequency: selectedFrequency },
      );
      setPreview(response.data);
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'Não foi possível calcular o preview da mudança.';
      setPreview(null);
      setPreviewError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!preview || !canConfirm) return;

    setIsConfirming(true);
    try {
      await apiClient.post(
        API.SUBSCRIPTIONS_UPDATE,
        preview.previewPayload,
        { headers: { 'Idempotency-Key': buildIdempotencyKey() } },
      );
      toast.success('Alteração de assinatura confirmada.');
      router.push(ROUTES.BILLING_SUBSCRIPTION);
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'Não foi possível confirmar a alteração.';
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <PageWrapper className="max-w-4xl">
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper className="max-w-4xl">
        <ErrorState message={error} onRetry={refetch} />
      </PageWrapper>
    );
  }

  if (!subscription) {
    return (
      <PageWrapper className="max-w-4xl">
        <EmptyState
          icon={Calculator}
          title="Sem assinatura ativa"
          description="Assine um plano mensal antes de simular uma troca de frequência."
          actionLabel="Ver planos"
          actionHref={ROUTES.CREDITS}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="max-w-4xl">
      <div className="mb-6">
        <Link
          href={ROUTES.BILLING_SUBSCRIPTION}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para assinatura
        </Link>

        <div className="flex items-start gap-3">
          <Calculator className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alterar plano</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Simule a cobrança proporcional antes de confirmar a nova frequência semanal.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">
              Escolha a nova frequência
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plano atual: {subscription.weeklyFrequency}x por semana.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FREQUENCY_OPTIONS.map((frequency) => {
              const isSelected = selectedFrequency === frequency;
              const isCurrent = subscription.weeklyFrequency === frequency;

              return (
                <button
                  key={frequency}
                  type="button"
                  onClick={() => {
                    setSelectedFrequency(frequency);
                    setPreview(null);
                    setPreviewError(null);
                  }}
                  className={cn(
                    'min-h-[92px] rounded-lg border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted',
                  )}
                  aria-pressed={isSelected}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-foreground">
                      {frequency}x por semana
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Atual
                      </span>
                    )}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">
                    {formatMoney(calculateSubscriptionMonthlyAmountCents(frequency), 'usd')}/mês estimado
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing}
              className="min-h-[44px]"
              aria-busy={isPreviewing}
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Calculando
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Gerar preview
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-[44px]')}
              aria-busy={isConfirming}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Confirmando
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Confirmar mudança
                </>
              )}
            </button>
          </div>

          {selectedIsCurrent && (
            <p className="mt-3 text-sm text-muted-foreground">
              Essa opção já é seu plano atual. Gere o preview para conferir os valores sem alterar a assinatura.
            </p>
          )}

          {previewError && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {previewError}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Preview financeiro</h2>

          {!previewMatchesSelection && (
            <p className="mt-3 text-sm text-muted-foreground">
              Gere um preview para ver proration, impostos estimados e data efetiva antes da confirmação.
            </p>
          )}

          {previewMatchesSelection && preview && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Mudança</p>
                <p className="text-base font-semibold text-foreground">
                  {preview.currentWeeklyFrequency}x para {preview.requestedWeeklyFrequency}x por semana
                </p>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Novo mensal</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(preview.nextMonthlyAmountCents, preview.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Proration</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(preview.prorationAmountCents, preview.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Imposto estimado</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(preview.estimatedTaxCents, preview.currency)}
                  </dd>
                </div>
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Cobrança agora</dt>
                    <dd className="text-lg font-semibold text-foreground">
                      {formatMoney(preview.amountDueNowCents, preview.currency)}
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Efetiva em {formatDateTime(preview.effectiveAt)}. O período atual termina em{' '}
                {formatDateTime(preview.currentPeriodEnd)}.
              </div>

              {preview.changeType === 'current_plan' && (
                <p className="text-sm text-muted-foreground">
                  O plano selecionado já está ativo. Nenhuma cobrança ou alteração será enviada.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </PageWrapper>
  );
}
