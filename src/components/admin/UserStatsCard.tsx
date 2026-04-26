'use client';

import { useAdminMetrics, type MetricPeriod } from '@/hooks/useAdminMetrics';
import { MetricCardShell } from './MetricCardShell';

interface UsersData {
  activeUsers:       { dau: number; wau: number; mau: number };
  newSignups:        number;
  totalStudents:     number;
  retentionRate:     number;
  returningStudents: number;
}

export function UserStatsCard({ period, refreshKey }: { period: MetricPeriod; refreshKey: number }) {
  const { data, loading, error, refetch } = useAdminMetrics<UsersData>('users', period, refreshKey);
  const empty = !!data && data.totalStudents === 0;

  return (
    <MetricCardShell title="Usuarios" loading={loading} error={error} empty={empty} onRetry={refetch}>
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">DAU</p>
              <p className="text-xl font-bold text-foreground">{data.activeUsers.dau}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">WAU</p>
              <p className="text-xl font-bold text-foreground">{data.activeUsers.wau}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MAU</p>
              <p className="text-xl font-bold text-foreground">{data.activeUsers.mau}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Novos cadastros ({data.newSignups >= 0 ? 'periodo' : ''})</p>
              <p className="text-xl font-bold text-primary">{data.newSignups}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Retencao</p>
              <p className="text-xl font-bold text-foreground">{data.retentionRate}%</p>
            </div>
          </div>
        </div>
      )}
    </MetricCardShell>
  );
}
