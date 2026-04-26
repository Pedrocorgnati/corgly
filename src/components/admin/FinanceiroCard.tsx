'use client';

import { useAdminMetrics, type MetricPeriod } from '@/hooks/useAdminMetrics';
import { MetricCardShell } from './MetricCardShell';

interface FinancialsData {
  revenue:       Array<{ currency: string; amount: number; count: number }>;
  revenueDelta:  Array<{ currency: string; delta: number | null }>;
  mrr:           number;
  churnRate:     number;
  subscriptions: { active: number; cancelledInPeriod: number; activeAtPeriodStart: number };
}

const CURRENCY_SYMBOLS: Record<string, string> = { usd: '$', brl: 'R$', eur: '€', usdc: 'USDC ' };

function formatAmount(cents: number, currency: string) {
  const amount = (cents / 100).toFixed(2);
  return `${CURRENCY_SYMBOLS[currency.toLowerCase()] ?? ''}${amount}`;
}

export function FinanceiroCard({ period, refreshKey }: { period: MetricPeriod; refreshKey: number }) {
  const { data, loading, error, refetch } = useAdminMetrics<FinancialsData>('financials', period, refreshKey);
  const empty = !!data && data.revenue.length === 0 && data.mrr === 0;

  return (
    <MetricCardShell title="Financeiro" loading={loading} error={error} empty={empty} onRetry={refetch}>
      {data && (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Receita no periodo</p>
            <div className="space-y-1">
              {data.revenue.map((r) => {
                const delta = data.revenueDelta.find((d) => d.currency === r.currency)?.delta;
                return (
                  <div key={r.currency} className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-foreground">{formatAmount(r.amount, r.currency)}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.count} {r.count === 1 ? 'pagamento' : 'pagamentos'}
                      {typeof delta === 'number' && (
                        <span className={delta >= 0 ? 'text-success ml-2' : 'text-destructive ml-2'}>
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Assinaturas ativas</p>
              <p className="text-xl font-bold text-foreground">{data.mrr}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Churn</p>
              <p className="text-xl font-bold text-foreground">{data.churnRate}%</p>
            </div>
          </div>
        </div>
      )}
    </MetricCardShell>
  );
}
