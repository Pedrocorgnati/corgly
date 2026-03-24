'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

export function RecentFeedbackList({ feedbacks, isLoading }: RecentFeedbackListProps) {
  if (isLoading) {
    return (
      <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-4">Avaliacoes Recentes</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground mb-4">Avaliacoes Recentes</p>

      {feedbacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Calendar className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">Nenhum feedback ainda</p>
          <Link href={ROUTES.PROGRESS} className="text-primary text-xs mt-2 hover:underline">
            Ver progresso &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {feedbacks.slice(0, 3).map((fb) => (
            <div
              key={fb.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <span className="text-sm text-foreground">{formatDate(fb.sessionDate)}</span>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={scoreBadgeClasses(fb.averageScore)}>
                  &#9733; {fb.averageScore.toFixed(1)}
                </Badge>
                <Link
                  href={`/session/${fb.sessionId}/feedback`}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  Ver detalhes
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link href={ROUTES.HISTORY} className="text-primary text-sm font-medium hover:underline mt-3 block">
        Ver tudo &rarr;
      </Link>
    </div>
  );
}
