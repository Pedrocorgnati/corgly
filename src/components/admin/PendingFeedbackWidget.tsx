import Link from 'next/link';
import { MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-warning" />
          <h2 className="font-semibold text-foreground">Feedbacks Pendentes</h2>
        </div>
        {count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
            {count}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhum feedback pendente"
          description="Todos os feedbacks estão em dia."
          className="py-6"
        />
      ) : (
        <>
          <ul className="space-y-3" role="list">
            {items.map((item) => (
              <li key={item.sessionId}>
                <Link
                  href={ROUTES.ADMIN_FEEDBACK(item.sessionId)}
                  className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.student.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aula em {formatSessionDate(item.sessionDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 ml-3">
                    <Clock className="h-3 w-3" />
                    <span>{formatRelativeTime(item.completedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-border">
            <Link
              href={ROUTES.ADMIN_SESSIONS}
              className="text-xs text-primary hover:underline flex items-center justify-center gap-1"
            >
              Ver todos
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
