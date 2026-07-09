'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageWrapper } from '@/components/shared';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import type { RefundAdminDisplayStatus } from '@/lib/billing/refund-admin.service';
import { getRegionalDisplay } from '@/lib/billing/currency-policy';
import { toCurrency } from '@/lib/currency';

interface RefundAdminItem {
  id: string;
  paymentId: string;
  userEmail: string;
  studentReason: string;
  paymentAmount: number;
  paymentCurrency: string;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  displayStatus: RefundAdminDisplayStatus;
  displayMessage: string | null;
  updatedAt: string;
}

interface RefundsListResponse {
  items: RefundAdminItem[];
  total: number;
}

interface RefundActionResponse {
  request: RefundAdminItem;
}

interface ApiEnvelope<T> {
  data: T;
  error: string | null;
  message: string | null;
}

const FILTERS: Array<{ value: 'all' | RefundAdminDisplayStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Negados' },
  { value: 'STRIPE_FAILURE', label: 'Falha Stripe' },
];

type RefundDecision = 'approve' | 'reject';

// Exibicao de moeda via politica canonica (ADR-0006 §3/§4): admin e checkout
// consomem a MESMA `getRegionalDisplay`; nada de formatacao reimplementada aqui.
function formatMoney(amountCents: number, currency: string): string {
  return getRegionalDisplay(amountCents, toCurrency(currency), 'pt-BR').formatted;
}

function statusColor(status: RefundAdminDisplayStatus): string {
  if (status === 'APPROVED') return 'text-success bg-success/10 border-success/25';
  if (status === 'REJECTED') return 'text-destructive bg-destructive/10 border-destructive/30';
  if (status === 'STRIPE_FAILURE') return 'text-amber-600 bg-amber-100 border-amber-300';
  return 'text-muted-foreground bg-muted border-border';
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Erro ao processar solicitação.';
}

export default function AdminRefundsPage() {
  const [items, setItems] = useState<RefundAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<'all' | RefundAdminDisplayStatus>('all');
  const [actionBusyById, setActionBusyById] = useState<Record<string, boolean>>({});
  const [reasonsById, setReasonsById] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.displayStatus === filter);
  }, [filter, items]);

  const canSubmitReason = (id: string): boolean => {
    const reason = reasonsById[id]?.trim();
    return !!reason && reason.length >= 5;
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<ApiEnvelope<RefundsListResponse>>(API.ADMIN.BILLING_REFUNDS);
      setItems(response.data.items);
    } catch (error) {
      toast.error(formatError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, []);

  const onReasonChange = (id: string, reason: string) => {
    setReasonsById((state) => ({ ...state, [id]: reason }));
  };

  const handleDecision = async (item: RefundAdminItem, decision: RefundDecision) => {
    const reason = reasonsById[item.id]?.trim() ?? '';
    setActionBusyById((state) => ({ ...state, [item.id]: true }));

    try {
      const payload = {
        requestId: item.id,
        action: decision,
        reason,
      };

      const response = await apiClient.post<ApiEnvelope<RefundActionResponse>>(API.ADMIN.BILLING_REFUNDS, payload);
      const updated = response.data.request;

      setItems((state) => state.map((current) => (current.id === updated.id ? updated : current)));
      setReasonsById((state) => ({ ...state, [item.id]: '' }));

      if (decision === 'approve') {
        toast.success('Reembolso aprovado.');
      } else {
        toast.success('Reembolso rejeitado.');
      }
    } catch (error) {
      toast.error(formatError(error));
    } finally {
      setActionBusyById((state) => ({ ...state, [item.id]: false }));
    }
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Reembolsos Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprovação administrativa, negação e reexecução com estado de falha de Stripe.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando reembolsos...</p>}

      {!loading && filteredItems.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-8 text-sm text-muted-foreground text-center bg-card">
          Nenhum item encontrado para o filtro atual.
        </div>
      )}

      <div className="space-y-4">
        {filteredItems.map((item) => {
          const busy = actionBusyById[item.id] === true;
          return (
            <div key={item.id} className="bg-card border border-border rounded-xl p-4 sm:p-5">
              <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                <div>
                  <p className="font-semibold text-sm text-foreground">Pedido {item.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Pagamento {item.paymentId} · Usuário {item.userEmail} · Atualizado em{' '}
                    {new Date(item.updatedAt).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-sm mt-1">Valor: {formatMoney(item.paymentAmount, item.paymentCurrency)}</p>
                </div>

                <Badge className={statusColor(item.displayStatus)}>{item.displayStatus.replace('_', ' ')}</Badge>
              </div>

              <p className="text-sm text-muted-foreground mb-3">Motivo do aluno: {item.studentReason}</p>
              {item.displayMessage && <p className="text-sm text-foreground/80 mb-3">{item.displayMessage}</p>}

              {(item.displayStatus === 'PENDING' || item.displayStatus === 'STRIPE_FAILURE') && (
                <div className="space-y-3">
                  <Textarea
                    value={reasonsById[item.id] ?? ''}
                    onChange={(event) => onReasonChange(item.id, event.target.value)}
                    placeholder="Motivo obrigatório para decisão"
                    className="min-h-24"
                    maxLength={600}
                    disabled={busy || isPending}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      disabled={busy || isPending || !canSubmitReason(item.id)}
                      onClick={() => handleDecision(item, 'reject')}
                      variant="outline"
                    >
                      Rejeitar
                    </Button>
                    <Button
                      disabled={busy || isPending || !canSubmitReason(item.id)}
                      onClick={() => handleDecision(item, 'approve')}
                    >
                      Aprovar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
