'use client';
import { API } from '@/lib/constants/routes';

import { useState, useEffect, useCallback } from 'react';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  creditBatchId: string | null;
  stripePaymentIntentId: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 10;

function formatCurrency(amount: number, currency: string) {
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  COMPLETED: { label: 'Pago', variant: 'default' },
  PENDING: { label: 'Pendente', variant: 'secondary' },
  FAILED: { label: 'Falhou', variant: 'destructive' },
  REFUNDED: { label: 'Reembolsado', variant: 'outline' },
};

export function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async (p: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await apiClient.get<{ data: { payments: Payment[]; pagination: PaginationMeta } }>(
        API.PAYMENTS,
        { params: { page: p, limit: PAGE_SIZE } },
      );
      setPayments(json.data.payments);
      setPagination(json.data.pagination);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar pagamentos';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments(page);
  }, [page, fetchPayments]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchPayments(page)} />;
  }

  if (!payments.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma compra ainda"
        description="Suas transações de créditos aparecerão aqui"
        actionLabel="Comprar créditos"
        actionHref={ROUTES.CREDITS}
      />
    );
  }

  return (
    <div>
      {/* Mobile: card layout */}
      <div className="space-y-3 sm:hidden">
        {payments.map((payment) => {
          const status = STATUS_MAP[payment.status] ?? { label: payment.status, variant: 'secondary' as const };
          return (
            <div
              key={payment.id}
              className="bg-card border border-border rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {formatCurrency(payment.amount, payment.currency)}
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</p>
            </div>
          );
        })}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Data</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Valor</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">ID</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const status = STATUS_MAP[payment.status] ?? { label: payment.status, variant: 'secondary' as const };
              return (
                <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground">{formatDate(payment.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {formatCurrency(payment.amount, payment.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {payment.id.slice(0, 8)}...
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={pagination.pages}
            onPageChange={handlePageChange}
            showInfo
            total={pagination.total}
            limit={pagination.limit}
          />
        </div>
      )}
    </div>
  );
}
