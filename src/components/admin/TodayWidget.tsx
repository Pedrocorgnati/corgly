import Link from 'next/link';
import { Calendar, Play, CheckCircle2, XCircle, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';
import type { AdminDashboardData } from '@/actions/admin-dashboard';

interface TodayWidgetProps {
  today: AdminDashboardData['today'];
}

const statItems = [
  { key: 'scheduled', slug: 'scheduled', label: 'Agendadas', icon: Calendar, color: 'text-brand-500', bg: 'bg-brand-100', href: ROUTES.ADMIN_SCHEDULE },
  { key: 'inProgress', slug: 'in-progress', label: 'Em andamento', icon: Play, color: 'text-warning', bg: 'bg-warning/10', href: ROUTES.ADMIN_SESSIONS },
  { key: 'completed', slug: 'completed', label: 'Concluídas', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', href: ROUTES.ADMIN_SESSIONS },
  { key: 'cancelled', slug: 'cancelled', label: 'Canceladas', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', href: ROUTES.ADMIN_SESSIONS },
] as const;

export function TodayWidget({ today }: TodayWidgetProps) {
  const total = today.scheduled + today.inProgress + today.completed + today.cancelled;

  return (
    <WidgetCard
      data-testid="admin-dashboard-today"
      title="Aulas de hoje"
      icon={CalendarDays}
      action={
        <span className="text-[12px] text-muted-foreground">
          {total} {total === 1 ? 'aula' : 'aulas'} no total
        </span>
      }
    >
      <div data-testid="admin-dashboard-today-stats" className="grid grid-cols-2 gap-3">
        {statItems.map(({ key, slug, label, icon: Icon, color, bg, href }) => (
          <Link
            key={key}
            data-testid={`admin-dashboard-today-${slug}-link`}
            href={href}
            className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className={cn(
              'flex items-center justify-center h-9 w-9 rounded-lg flex-shrink-0',
              bg,
              key === 'inProgress' && today[key] > 0 && 'animate-pulse',
            )}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div>
              <p className={cn('text-[1.35rem] font-semibold leading-none', color)}>
                {today[key]}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}
