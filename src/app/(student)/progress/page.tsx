import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarChart3, ChevronRight, Download } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES, API } from '@/lib/constants/routes';
import { getProgressData, getFeedbackHistory } from '@/actions/progress';
import type { ProgressData, FeedbackHistoryResult } from '@/actions/progress';
import { ProgressCharts } from '@/components/progress/ProgressCharts';
import { DimensionRadar } from '@/components/progress/DimensionRadar';
import { TrendLineChart } from '@/components/progress/TrendLineChart';
import { FeedbackHistory } from '@/components/progress/FeedbackHistory';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Meu Progresso | Corgly',
  robots: 'noindex',
};

function ChartSkeleton({ height = 'h-[300px]' }: { height?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className={`${height} w-full rounded-xl`} />
    </div>
  );
}

async function ProgressWidgets() {
  const [progressResult, historyResult] = await Promise.all([
    getProgressData(),
    getFeedbackHistory(1, 'all'),
  ]);

  const progress: ProgressData | null = progressResult.data;
  const history: FeedbackHistoryResult | null = historyResult.data;

  const hasScores =
    progress &&
    progress.lastFeedbacks.length > 0 &&
    (progress.averageScores.clarity > 0 ||
      progress.averageScores.didactics > 0 ||
      progress.averageScores.punctuality > 0 ||
      progress.averageScores.engagement > 0);

  // Map API field names to component props
  const feedbacksForCharts = progress?.lastFeedbacks.map((f) => ({
    sessionDate: f.sessionDate,
    averageScore: f.averageScore,
    scores: {
      clarity: f.scores.clarity,
      didactics: f.scores.didactics,
      punctuality: f.scores.punctuality,
      engagement: f.scores.engagement,
    },
  })) ?? [];

  const historyItems = history?.items.map((item) => ({
    id: item.id,
    sessionDate: item.sessionDate,
    scores: item.scores,
    comment: item.comment,
    averageScore: item.averageScore,
    sessionId: item.sessionId,
  })) ?? [];

  const historyData = {
    items: historyItems,
    total: history?.total ?? 0,
    page: history?.page ?? 1,
    limit: history?.limit ?? 20,
  };

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{progress?.completedSessions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Aulas concluidas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-success">{progress?.totalSessions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Total de sessoes</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-secondary">
            {hasScores
              ? (
                  (progress!.averageScores.clarity +
                    progress!.averageScores.didactics +
                    progress!.averageScores.punctuality +
                    progress!.averageScores.engagement) /
                  4
                ).toFixed(1)
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Nota media</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-warning capitalize">
            {progress?.trend === 'improving'
              ? 'Subindo'
              : progress?.trend === 'declining'
                ? 'Caindo'
                : 'Estavel'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tendencia</p>
        </div>
      </div>

      {/* Radar + Line chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <DimensionRadar scores={hasScores ? progress!.averageScores : null} />
        </div>
        <div className="lg:col-span-2">
          <ProgressCharts feedbacks={feedbacksForCharts} />
        </div>
      </div>

      {/* Trend chart - full width */}
      <div className="mb-6">
        <TrendLineChart feedbacks={feedbacksForCharts} />
      </div>

      {/* Feedback history - full width */}
      <FeedbackHistory initialData={historyData} />
    </>
  );
}

export default function ProgressPage() {
  return (
    <PageWrapper>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href={ROUTES.DASHBOARD} className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </li>
          <li>
            <ChevronRight className="w-3.5 h-3.5 inline" />
          </li>
          <li className="text-foreground font-medium">Meu Progresso</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meu Progresso</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Acompanhe sua evolucao em portugues
            </p>
          </div>
        </div>
        <a
          href={`${API.FEEDBACK_HISTORY}?format=csv&period=all`}
          download
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </a>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <Skeleton className="h-8 w-12 mx-auto mb-2" />
                  <Skeleton className="h-3 w-20 mx-auto" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ChartSkeleton height="h-[360px]" />
              <div className="lg:col-span-2">
                <ChartSkeleton />
              </div>
            </div>
            <ChartSkeleton />
            <ChartSkeleton height="h-[400px]" />
          </div>
        }
      >
        <ProgressWidgets />
      </Suspense>
    </PageWrapper>
  );
}
