'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, Loader2, Send } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { getRegionalDisplay } from '@/lib/billing/currency-policy';
import { toCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

interface HistoryItem {
  id: string;
  createdAt: string;
  description: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  receiptAvailable: boolean;
  refundEligible?: boolean;
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type SubmitState = 'idle' | 'submitting' | 'success' | 'already-requested';

/**
 * Rotulo do status: so a chave de catalogo vive aqui. Ate 2026-09-07 esta pagina
 * cravava portugues e ignorava o idioma escolhido pelo aluno. O bloco reaproveitado
 * e o mesmo do extrato de creditos (`credits.history.status*`).
 */
const STATUS_LABEL_KEY: Record<PaymentStatus, string> = {
  PENDING: 'statusPending',
  SUCCEEDED: 'statusSucceeded',
  FAILED: 'statusFailed',
  REFUNDED: 'statusRefunded',
};

const STATUS_CLASS: Record<PaymentStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  SUCCEEDED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  FAILED: 'border-red-200 bg-red-50 text-red-700',
  REFUNDED: 'border-blue-200 bg-blue-50 text-blue-700',
};


export default function BillingPaymentDetailPage() {
  const t = useTranslations('pages.paymentDetail');
  const tStatus = useTranslations('credits.history');
  const locale = useLocale();
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId;
  const [payment, setPayment] = useState<HistoryItem | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const eligible = payment?.refundEligible ?? payment?.status === 'SUCCEEDED';
  const formattedAmount = useMemo(() => {
    if (!payment) return '';
    return getRegionalDisplay(payment.amount, toCurrency(payment.currency), locale).formatted;
  }, [payment, locale]);

  const loadPayment = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    setSubmitError(null);
    setSubmitState('idle');

    try {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();

      while (true) {
        const qs = new URLSearchParams({ limit: '50' });
        if (cursor) qs.set('cursor', cursor);

        const response = await fetch(`/api/v1/billing/history?${qs.toString()}`, {
          credentials: 'include',
        });
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.error || t('errorLoad'));
        }

        const data = json.data as { items: HistoryItem[]; nextCursor: string | null };
        const found = data.items.find((item) => item.id === paymentId);

        if (found) {
          const foundEligible = found.refundEligible ?? found.status === 'SUCCEEDED';
          setPayment(found);
          setLoadState('ready');

          if (foundEligible) {
            const refundResponse = await fetch(
              `/api/v1/billing/refund-requests?paymentId=${encodeURIComponent(paymentId)}`,
              { credentials: 'include' },
            );
            const refundJson = await refundResponse.json().catch(() => null);

            if (refundResponse.ok && refundJson?.data?.refundRequest) {
              setSubmitState('already-requested');
            } else if (!refundResponse.ok) {
              setSubmitError(
                refundJson?.error || t('errorCheckExisting'),
              );
            }
          }

          return;
        }

        if (!data.nextCursor) break;
        if (seenCursors.has(data.nextCursor)) {
          throw new Error(t('errorCursorRepeat'));
        }
        seenCursors.add(data.nextCursor);
        cursor = data.nextCursor;
      }

      setPayment(null);
      setLoadState('not-found');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('errorUnknown'));
      setLoadState('error');
    }
  }, [paymentId, t]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  async function submitRefundRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!reason.trim()) {
      setSubmitError(t('errorReasonRequired'));
      return;
    }

    setSubmitState('submitting');

    try {
      const response = await fetch('/api/v1/billing/refund-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, reason }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.error || t('errorRegister'));
      }

      setSubmitState(json?.data?.idempotentReplay ? 'already-requested' : 'success');
    } catch (error) {
      setSubmitState('idle');
      setSubmitError(error instanceof Error ? error.message : t('errorUnknown'));
    }
  }

  return (
    <PageWrapper data-testid="page-billing-payment-detail" className="max-w-3xl">
      <div data-testid="billing-payment-detail-header" className="mb-6 flex items-center gap-3">
        <Link
          href="/billing/history"
          aria-label={t('backAria')}
          data-testid="billing-payment-detail-back-link"
          className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('subtitle', { id: paymentId })}
          </p>
        </div>
      </div>

      {loadState === 'loading' && (
        <div data-testid="billing-payment-detail-loading" className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      )}

      {loadState === 'error' && (
        <div data-testid="billing-payment-detail-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </div>
          <Button data-testid="billing-payment-detail-retry-button" type="button" variant="outline" onClick={loadPayment}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loadState === 'not-found' && (
        <EmptyState
          data-testid="billing-payment-detail-empty"
          title={t('notFoundTitle')}
          description={t('notFoundDesc')}
        />
      )}

      {loadState === 'ready' && payment && (
        <div className="flex flex-col gap-4">
          <section data-testid="billing-payment-detail-summary" className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{payment.description}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(payment.createdAt).toLocaleDateString(locale)}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLASS[payment.status]}`}>
                {tStatus(STATUS_LABEL_KEY[payment.status])}
              </span>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">{t('amount')}</dt>
                <dd className="mt-1 text-base font-semibold text-foreground">{formattedAmount}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">{t('currency')}</dt>
                <dd className="mt-1 text-base font-semibold uppercase text-foreground">
                  {payment.currency}
                </dd>
              </div>
            </dl>
          </section>

          {!eligible && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-medium">
                <Ban className="h-4 w-4" />
                {t('notEligibleTitle')}
              </div>
              <p className="mt-1">
                {t('notEligibleDesc')}
              </p>
            </div>
          )}

          {eligible && (submitState === 'success' || submitState === 'already-requested') && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {submitState === 'already-requested'
                  ? t('alreadyRequested')
                  : t('requestRegistered')}
              </div>
              <p className="mt-1">
                {t('reviewNotice')}
              </p>
            </div>
          )}

          {eligible && submitState !== 'success' && submitState !== 'already-requested' && (
            <form onSubmit={submitRefundRequest} className="rounded-lg border border-border bg-card p-5">
              <label htmlFor="refund-reason" className="text-sm font-medium text-foreground">
                {t('reasonLabel')}
              </label>
              <Textarea
                id="refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitState === 'submitting'}
                maxLength={1000}
                className="mt-2 min-h-32"
                placeholder={t('reasonPlaceholder')}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{reason.length}/1000</span>
                <Button type="submit" disabled={submitState === 'submitting'}>
                  {submitState === 'submitting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-2">{t('submit')}</span>
                </Button>
              </div>
              {submitError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {submitError}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
