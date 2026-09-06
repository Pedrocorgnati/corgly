'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceiroCard } from './FinanceiroCard';
import { EngagementCard } from './EngagementCard';
import { UserStatsCard } from './UserStatsCard';
import type { MetricPeriod } from '@/hooks/useAdminMetrics';

const PERIOD_OPTIONS: Array<{ value: MetricPeriod; label: string }> = [
  { value: '7d',  label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

export function MetricsPanel() {
  const [period, setPeriod] = useState<MetricPeriod>('30d');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section data-testid="admin-metrics-panel" className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[1.15rem] font-bold text-ink tracking-tight">Metricas do periodo</h2>
          <span className="rule-corgly mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <div data-testid="admin-metrics-period-tabs" className="inline-flex rounded-lg border border-border bg-card p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`admin-metrics-period-${opt.value}-button`}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-[12.5px] font-semibold rounded-md transition',
                  period === opt.value
                    ? 'bg-brand-500 text-white'
                    : 'text-muted-foreground hover:text-brand-500',
                )}
                aria-pressed={period === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            data-testid="admin-metrics-refresh-button"
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Atualizar todos"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:border-brand-300 hover:text-brand-500 transition"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
        </div>
      </div>

      <div data-testid="admin-metrics-cards" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FinanceiroCard period={period} refreshKey={refreshKey} />
        <EngagementCard period={period} refreshKey={refreshKey} />
        <UserStatsCard period={period} refreshKey={refreshKey} />
      </div>
    </section>
  );
}
