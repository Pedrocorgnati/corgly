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
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Metricas do periodo</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-background p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition',
                  period === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={period === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Atualizar todos"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FinanceiroCard period={period} refreshKey={refreshKey} />
        <EngagementCard period={period} refreshKey={refreshKey} />
        <UserStatsCard period={period} refreshKey={refreshKey} />
      </div>
    </section>
  );
}
