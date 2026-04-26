'use client';

import { useAdminMetrics, type MetricPeriod } from '@/hooks/useAdminMetrics';
import { MetricCardShell } from './MetricCardShell';

interface EngagementData {
  sessions: { completed: number; cancelledStudent: number; cancelledAdmin: number; noshow: number; total: number };
  avgDurationMin: number;
  feedback: { npsScore: number; sampleSize: number };
}

export function EngagementCard({ period, refreshKey }: { period: MetricPeriod; refreshKey: number }) {
  const { data, loading, error, refetch } = useAdminMetrics<EngagementData>('engagement', period, refreshKey);
  const empty = !!data && data.sessions.total === 0;

  return (
    <MetricCardShell title="Engajamento" loading={loading} error={error} empty={empty} onRetry={refetch}>
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Concluidas</p>
              <p className="text-xl font-bold text-success">{data.sessions.completed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canceladas</p>
              <p className="text-xl font-bold text-destructive">
                {data.sessions.cancelledStudent + data.sessions.cancelledAdmin}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">No-show</p>
              <p className="text-xl font-bold text-warning">{data.sessions.noshow}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duracao media</p>
              <p className="text-xl font-bold text-foreground">{data.avgDurationMin} min</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Score medio (feedback) {data.feedback.sampleSize > 0 && `— amostra ${data.feedback.sampleSize}`}
            </p>
            <p className="text-xl font-bold text-primary">{data.feedback.npsScore} / 5</p>
          </div>
        </div>
      )}
    </MetricCardShell>
  );
}
