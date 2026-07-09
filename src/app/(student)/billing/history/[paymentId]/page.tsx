'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pendente',
  SUCCEEDED: 'Pago',
  FAILED: 'Falhou',
  REFUNDED: 'Reembolsado',
};

const STATUS_CLASS: Record<PaymentStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  SUCCEEDED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  FAILED: 'border-red-200 bg-red-50 text-red-700',
  REFUNDED: 'border-blue-200 bg-blue-50 text-blue-700',
};


export default function BillingPaymentDetailPage() {
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
    return getRegionalDisplay(payment.amount, toCurrency(payment.currency), 'pt-BR').formatted;
  }, [payment]);

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
          throw new Error(json?.error || 'Erro ao carregar pagamento.');
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
                refundJson?.error || 'Não foi possível verificar pedido de reembolso existente.',
              );
            }
          }

          return;
        }

        if (!data.nextCursor) break;
        if (seenCursors.has(data.nextCursor)) {
          throw new Error('Paginação do extrato retornou cursor repetido.');
        }
        seenCursors.add(data.nextCursor);
        cursor = data.nextCursor;
      }

      setPayment(null);
      setLoadState('not-found');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro desconhecido.');
      setLoadState('error');
    }
  }, [paymentId]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  async function submitRefundRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!reason.trim()) {
      setSubmitError('Informe o motivo do pedido de reembolso.');
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
        throw new Error(json?.error || 'Não foi possível registrar o pedido.');
      }

      setSubmitState(json?.data?.idempotentReplay ? 'already-requested' : 'success');
    } catch (error) {
      setSubmitState('idle');
      setSubmitError(error instanceof Error ? error.message : 'Erro desconhecido.');
    }
  }

  return (
    <PageWrapper className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/billing/history"
          aria-label="Voltar para extrato"
          className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedido de reembolso</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pagamento {paymentId}
          </p>
        </div>
      </div>

      {loadState === 'loading' && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pagamento...
        </div>
      )}

      {loadState === 'error' && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </div>
          <Button type="button" variant="outline" onClick={loadPayment}>
            Tentar novamente
          </Button>
        </div>
      )}

      {loadState === 'not-found' && (
        <EmptyState
          title="Pagamento não encontrado"
          description="Não encontramos esse pagamento no seu extrato."
        />
      )}

      {loadState === 'ready' && payment && (
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{payment.description}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(payment.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLASS[payment.status]}`}>
                {STATUS_LABEL[payment.status]}
              </span>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Valor</dt>
                <dd className="mt-1 text-base font-semibold text-foreground">{formattedAmount}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Moeda</dt>
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
                Este pagamento não está elegível para pedido de reembolso.
              </div>
              <p className="mt-1">
                Apenas pagamentos concluídos podem iniciar análise de reembolso.
              </p>
            </div>
          )}

          {eligible && (submitState === 'success' || submitState === 'already-requested') && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {submitState === 'already-requested'
                  ? 'Pedido já registrado anteriormente.'
                  : 'Pedido registrado com sucesso.'}
              </div>
              <p className="mt-1">
                O suporte financeiro revisará sua solicitação antes de qualquer ação no Stripe.
              </p>
            </div>
          )}

          {eligible && submitState !== 'success' && submitState !== 'already-requested' && (
            <form onSubmit={submitRefundRequest} className="rounded-lg border border-border bg-card p-5">
              <label htmlFor="refund-reason" className="text-sm font-medium text-foreground">
                Motivo do reembolso
              </label>
              <Textarea
                id="refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitState === 'submitting'}
                maxLength={1000}
                className="mt-2 min-h-32"
                placeholder="Descreva por que você está solicitando o reembolso."
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{reason.length}/1000</span>
                <Button type="submit" disabled={submitState === 'submitting'}>
                  {submitState === 'submitting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-2">Enviar pedido</span>
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
