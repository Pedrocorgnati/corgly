import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AlertCircle, BarChart3, ChevronRight, Download } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES, API } from '@/lib/constants/routes';
import { getProgressData, getFeedbackHistory } from '@/actions/progress';
import type { FeedbackScores, ProgressData, FeedbackHistoryResult } from '@/actions/progress';
import { ProgressCharts } from '@/components/progress/ProgressCharts';
import { DimensionRadar } from '@/components/progress/DimensionRadar';
import { TrendLineChart } from '@/components/progress/TrendLineChart';
import { FeedbackHistory } from '@/components/progress/FeedbackHistory';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Meu Progresso | Corgly',
  robots: 'noindex',
};

/**
 * Vocabulario canonico das notas por dimensao. Fonte da verdade:
 * prisma/schema.prisma (listeningScore/speakingScore/writingScore/vocabularyScore),
 * src/schemas/feedback.schema.ts e src/services/feedback.service.ts (mapFeedback).
 * Nao existe clarity/didactics/punctuality/engagement em rota nenhuma.
 */
const DIMENSION_KEYS = ['listening', 'speaking', 'writing', 'vocabulary'] as const satisfies ReadonlyArray<keyof FeedbackScores>;

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Media das dimensoes presentes. `null` (e nunca NaN) quando nao ha nota alguma. */
function averageOfScores(scores: FeedbackScores | null): number | null {
  if (!scores) return null;
  const values = DIMENSION_KEYS.map((key) => scores[key]).filter(isScore);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

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

  // Zero Silencio: se um dos dois fetchers falhou, o usuario ve o motivo em vez
  // de uma tela de zeros indistinguivel de "aluno sem avaliacoes".
  const loadErrors = [progressResult.error, historyResult.error].filter(
    (message): message is string => Boolean(message),
  );

  // So ha perfil por dimensao quando existe ao menos uma avaliacao registrada
  // E ao menos uma dimensao com nota maior que zero (o backend devolve 0 em
  // todas as dimensoes no estado vazio — src/services/feedback.service.ts).
  const scores: FeedbackScores | null =
    progress && progress.lastFeedbacks.length > 0 ? progress.averageScores : null;
  const hasScores =
    scores !== null && DIMENSION_KEYS.some((key) => isScore(scores[key]) && scores[key] > 0);
  const radarScores = hasScores ? scores : null;
  const averageScore = averageOfScores(radarScores);

  // `lastFeedbacks` chega do backend em ordem decrescente de criacao
  // (feedback.service.ts: orderBy createdAt desc). Os graficos leem da esquerda
  // para a direita, entao a serie e reordenada para ordem cronologica.
  const feedbacksForCharts = [...(progress?.lastFeedbacks ?? [])]
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .map((f) => ({
      sessionDate: f.sessionDate,
      averageScore: f.averageScore,
      scores: f.scores,
    }));

  // O texto livre do backend se chama `overallFeedback` — `comment` nao existe.
  const historyItems = history?.items.map((item) => ({
    id: item.id,
    sessionDate: item.sessionDate,
    scores: item.scores,
    overallFeedback: item.overallFeedback,
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
      {loadErrors.length > 0 && (
        <div
          data-testid="progress-load-error"
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Nao foi possivel carregar todos os dados do seu progresso
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {loadErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div data-testid="progress-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{progress?.completedSessions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Aulas concluidas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-success">{progress?.totalSessions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Total de sessoes</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
          <p data-testid="progress-kpi-average-score" className="text-2xl font-bold text-secondary">
            {averageScore === null ? '—' : averageScore.toFixed(1)}
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
      <div data-testid="progress-charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <DimensionRadar scores={radarScores} />
        </div>
        <div className="lg:col-span-2">
          <ProgressCharts feedbacks={feedbacksForCharts} />
        </div>
      </div>

      {/* Trend chart - full width */}
      <div data-testid="progress-trend" className="mb-6">
        <TrendLineChart feedbacks={feedbacksForCharts} />
      </div>

      {/* Feedback history - full width */}
      <FeedbackHistory initialData={historyData} />
    </>
  );
}

export default function ProgressPage() {
  return (
    <PageWrapper data-testid="page-progress">
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
      <div data-testid="progress-header" className="mb-6 flex items-center justify-between">
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
          data-testid="progress-export-csv-button"
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
