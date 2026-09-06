'use client';

import Link from 'next/link';
import { Calendar, MessageSquareText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';

interface RecentFeedback {
  id: string;
  sessionDate: string;
  averageScore: number;
  sessionId: string;
}

interface RecentFeedbackListProps {
  feedbacks: RecentFeedback[];
  isLoading: boolean;
  /** Span na grade do dashboard. A GRADE manda no span; o card nao decide. */
  className?: string;
}

function scoreBadgeClasses(score: number): string {
  if (score >= 4) return 'bg-green-50 text-success border-green-200 dark:bg-green-950/20 dark:border-green-800';
  if (score >= 3) return 'bg-amber-50 text-warning border-amber-200 dark:bg-amber-950/20 dark:border-amber-800';
  return 'bg-red-50 text-destructive border-red-200 dark:bg-red-950/20 dark:border-red-800';
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

export function RecentFeedbackList({ feedbacks, isLoading, className }: RecentFeedbackListProps) {
  if (isLoading) {
    return (
      <WidgetCard
        data-testid="dashboard-recent-feedback"
        title="Avaliacoes recentes"
        icon={MessageSquareText}
        className={className}
      >
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      data-testid="dashboard-recent-feedback"
      title="Avaliacoes recentes"
      icon={MessageSquareText}
      className={className}
      footer={
        <Link
          href={ROUTES.HISTORY}
          className="text-brand-500 text-[13.5px] font-semibold hover:underline"
        >
          Ver tudo &rarr;
        </Link>
      }
    >
      {feedbacks.length === 0 ? (
        <div
          data-testid="dashboard-recent-feedback-empty"
          className="flex flex-col items-center justify-center py-8 text-muted-foreground"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 text-brand-500 mb-3">
            <Calendar className="h-5 w-5" />
          </span>
          <p className="text-[13.5px]">Nenhum feedback ainda</p>
          <Link href={ROUTES.PROGRESS} className="text-brand-500 text-[12px] font-medium mt-2 hover:underline">
            Ver progresso &rarr;
          </Link>
        </div>
      ) : (
        <div data-testid="dashboard-recent-feedback-list" className="space-y-2.5">
          {feedbacks.slice(0, 3).map((fb) => (
            <div
              key={fb.id}
              data-testid={`dashboard-recent-feedback-item-${fb.id}`}
              className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <span className="text-[13.5px] font-medium text-ink">{formatDate(fb.sessionDate)}</span>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={scoreBadgeClasses(fb.averageScore)}>
                  &#9733; {fb.averageScore.toFixed(1)}
                </Badge>
                <Link
                  href={`/session/${fb.sessionId}/feedback`}
                  className="text-brand-500 text-[12px] font-semibold hover:underline"
                >
                  Ver detalhes
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
