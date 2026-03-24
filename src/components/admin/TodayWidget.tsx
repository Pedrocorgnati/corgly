import Link from 'next/link';
import { Calendar, Play, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';
import type { AdminDashboardData } from '@/actions/admin-dashboard';

interface TodayWidgetProps {
  today: AdminDashboardData['today'];
}

const statItems = [
  { key: 'scheduled', label: 'Agendadas', icon: Calendar, color: 'text-primary', bg: 'bg-primary/10', href: ROUTES.ADMIN_SCHEDULE },
  { key: 'inProgress', label: 'Em andamento', icon: Play, color: 'text-warning', bg: 'bg-warning/10', href: ROUTES.ADMIN_SESSIONS },
  { key: 'completed', label: 'Concluídas', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', href: ROUTES.ADMIN_SESSIONS },
  { key: 'cancelled', label: 'Canceladas', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', href: ROUTES.ADMIN_SESSIONS },
] as const;

export function TodayWidget({ today }: TodayWidgetProps) {
  const total = today.scheduled + today.inProgress + today.completed + today.cancelled;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground">Aulas de Hoje</h2>
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? 'aula' : 'aulas'} no total
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statItems.map(({ key, label, icon: Icon, color, bg, href }) => (
          <Link
            key={key}
            href={href}
            className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors"
          >
            <div className={cn(
              'flex items-center justify-center h-9 w-9 rounded-lg',
              bg,
              key === 'inProgress' && today[key] > 0 && 'animate-pulse',
            )}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div>
              <p className={cn('text-xl font-bold leading-none', color)}>
                {today[key]}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
