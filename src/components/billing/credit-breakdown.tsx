'use client';
import { API } from '@/lib/constants/routes';

import { useState, useEffect, useCallback } from 'react';
import { Coins } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';

interface CreditBatch {
  id: string;
  totalCredits: number;
  usedCredits: number;
  source: string;
  expiresAt: string | null;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SUBSCRIPTION: 'Assinatura',
  PROMO: 'Promocional',
  MANUAL: 'Ajuste manual',
  REFUND: 'Reembolso',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getDaysUntilExpiry(expiresAt: string): number {
  const now = new Date();
  const expiry = new Date(expiresAt);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function CreditBreakdown() {
  const [balance, setBalance] = useState(0);
  const [breakdown, setBreakdown] = useState<CreditBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await apiClient.get<{ data: { balance: number; breakdown: CreditBatch[] } }>(API.CREDITS);
      setBalance(json.data.balance);
      setBreakdown(json.data.breakdown ?? []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar créditos';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchCredits} />;
  }

  const activeBatches = breakdown.filter(
    (b) => b.totalCredits - b.usedCredits > 0,
  );

  if (!activeBatches.length) {
    return (
      <EmptyState
        icon={Coins}
        title="Sem créditos ativos"
        description="Compre créditos para começar a agendar suas aulas."
        actionLabel="Comprar créditos"
        actionHref={ROUTES.CREDITS}
      />
    );
  }

  return (
    <div>
      {/* Balance summary */}
      <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="text-sm text-muted-foreground">Saldo total</p>
        <p className="text-2xl font-bold text-foreground">
          {balance} crédito{balance !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Batch list */}
      <div className="space-y-3">
        {activeBatches.map((batch) => {
          const remaining = batch.totalCredits - batch.usedCredits;
          const daysUntilExpiry = batch.expiresAt ? getDaysUntilExpiry(batch.expiresAt) : null;
          const isUrgent = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0;
          const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0;

          return (
            <div
              key={batch.id}
              className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {remaining}/{batch.totalCredits} crédito{batch.totalCredits !== 1 ? 's' : ''}
                  </span>
                  <Badge variant="outline">
                    {SOURCE_LABELS[batch.source] ?? batch.source}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Adicionado em {formatDate(batch.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {batch.expiresAt && (
                  <>
                    {isExpired && (
                      <Badge variant="destructive">Expirado</Badge>
                    )}
                    {isUrgent && !isExpired && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                        Expira em {daysUntilExpiry} dia{daysUntilExpiry !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {!isUrgent && !isExpired && (
                      <span className="text-xs text-muted-foreground">
                        Expira em {formatDate(batch.expiresAt)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
