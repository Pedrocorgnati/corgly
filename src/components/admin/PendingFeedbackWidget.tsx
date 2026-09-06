import Link from 'next/link';
import { MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';
import { EmptyState } from '@/components/ui/empty-state';
import type { AdminDashboardData } from '@/actions/admin-dashboard';

interface PendingFeedbackWidgetProps {
  pendingFeedbacks: AdminDashboardData['pendingFeedbacks'];
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'agora há pouco';
  if (hours === 1) return '1h atrás';
  return `${hours}h atrás`;
}

function formatSessionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PendingFeedbackWidget({ pendingFeedbacks }: PendingFeedbackWidgetProps) {
  const { count, items } = pendingFeedbacks;
  const hasItems = items.length > 0;

  return (
    <WidgetCard
      data-testid="admin-dashboard-pending-feedback"
      title="Feedbacks pendentes"
      icon={MessageSquare}
      accent={count > 0 ? 'amber' : 'brand'}
      action={
        count > 0 ? (
          <span className="text-[12px] px-2.5 py-0.5 rounded-full bg-warning/10 text-warning font-semibold">
            {count}
          </span>
        ) : undefined
      }
      footer={
        hasItems ? (
          <Link
            data-testid="admin-dashboard-pending-feedback-all-link"
            href={ROUTES.ADMIN_SESSIONS}
            className="text-[13px] font-semibold text-brand-500 hover:underline flex items-center justify-center gap-1"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : undefined
      }
    >
      {!hasItems ? (
        <EmptyState
          data-testid="admin-dashboard-pending-feedback-empty"
          icon={MessageSquare}
          title="Nenhum feedback pendente"
          description="Todos os feedbacks estão em dia."
          className="py-6"
        />
      ) : (
        <ul data-testid="admin-dashboard-pending-feedback-list" className="space-y-2.5" role="list">
          {items.map((item) => (
            <li key={item.sessionId}>
              <Link
                data-testid={`admin-dashboard-pending-feedback-item-${item.sessionId}`}
                href={ROUTES.ADMIN_FEEDBACK(item.sessionId)}
                className="flex items-center justify-between rounded-lg border border-border p-3.5 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink truncate">
                    {item.student.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Aula em {formatSessionDate(item.sessionDate)}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground flex-shrink-0 ml-3">
                  <Clock className="h-3 w-3" />
                  <span>{formatRelativeTime(item.completedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
