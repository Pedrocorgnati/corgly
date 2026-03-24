'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { CreditType, CREDIT_TYPE_MAP } from '@/lib/constants/enums';
import { formatDatePtBR } from '@/lib/format-datetime';
import { apiClient, ApiError } from '@/lib/api-client';

const PAGE_LIMIT = 20;
const TRUNCATE_LENGTH = 60;

const FILTER_KEYS = [CreditType.MANUAL, CreditType.REFUND, CreditType.PROMO] as const;
const FILTER_I18N: Record<string, string> = {
  [CreditType.MANUAL]: 'filterManual',
  [CreditType.REFUND]: 'filterRefund',
  [CreditType.PROMO]: 'filterPromo',
};

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  creditBatchId: string | null;
  stripePaymentIntentId: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function CreditLog() {
  const t = useTranslations('credits.admin.log');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const json = await apiClient.get<{ data: { payments: Payment[]; pagination: PaginationData } }>(
        '/api/v1/payments',
        { params: { page: targetPage, limit: PAGE_LIMIT } },
      );
      setPayments(json.data.payments);
      setPagination(json.data.pagination);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments(page);
  }, [page, fetchPayments]);

  function toggleFilter(key: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
  }

  const filteredPayments = activeFilters.size > 0
    ? payments.filter((p) => activeFilters.has(p.status))
    : payments;

  function truncate(text: string) {
    if (text.length <= TRUNCATE_LENGTH) return text;
    return text.slice(0, TRUNCATE_LENGTH) + '...';
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('title')}</h2>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <ErrorState
          message={error}
          onRetry={() => fetchPayments(page)}
        />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground mb-4">{t('title')}</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_KEYS.map((key) => (
          <Button
            key={key}
            variant={activeFilters.has(key) ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleFilter(key)}
            className="min-h-[44px]"
            aria-pressed={activeFilters.has(key)}
          >
            {t(FILTER_I18N[key])}
          </Button>
        ))}
      </div>

      {filteredPayments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('empty')}
          description={activeFilters.size > 0 ? t('emptyFiltered') : undefined}
        />
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {filteredPayments.map((payment) => (
              <div key={payment.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formatDatePtBR(payment.createdAt)}</span>
                  <Badge variant="outline">{payment.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </span>
                  {payment.creditBatchId && (
                    <span className="text-xs text-muted-foreground" title={payment.creditBatchId}>
                      {truncate(payment.creditBatchId)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t('status')}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t('amount')}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t('batchId')}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t('date')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant="outline">{CREDIT_TYPE_MAP[payment.status as CreditType]?.label ?? payment.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      {payment.currency} {payment.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" title={payment.creditBatchId ?? undefined}>
                      {payment.creditBatchId ? truncate(payment.creditBatchId) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDatePtBR(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.pages > 1 && (
            <Pagination
              page={page}
              totalPages={pagination.pages}
              onPageChange={handlePageChange}
              total={pagination.total}
              limit={pagination.limit}
              showInfo
              className="mt-4"
            />
          )}
        </>
      )}
    </div>
  );
}
