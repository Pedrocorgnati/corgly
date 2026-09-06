'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Vocabulario canonico das notas por dimensao. Fonte da verdade:
 * prisma/schema.prisma (listeningScore/speakingScore/writingScore/vocabularyScore),
 * src/schemas/feedback.schema.ts e src/services/feedback.service.ts (mapFeedback).
 */
interface FeedbackScores {
  listening: number;
  speaking: number;
  writing: number;
  vocabulary: number;
}

interface FeedbackEntry {
  sessionDate: string;
  averageScore: number;
  scores: FeedbackScores;
}

interface ProgressChartsProps {
  feedbacks: FeedbackEntry[];
  isLoading?: boolean;
}

const DIMENSION_LABELS: Record<keyof FeedbackScores, string> = {
  listening:  'Escuta',
  speaking:   'Fala',
  writing:    'Escrita',
  vocabulary: 'Vocabulário',
};

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as (keyof FeedbackScores)[];

/** Nota ausente ou nao-finita vira travessao — nunca `NaN` nem TypeError. */
function formatScore(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
}

/** Recharts abre lacuna em `null`; nota invalida nunca vira ponto no eixo. */
function toPoint(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Data indisponivel';
  return d.toLocaleDateString('pt-BR');
}

/**
 * O payload do tooltip vem do runtime do recharts, nao do nosso tipo: todo
 * campo e opcional aqui de proposito. Ler `.toFixed` direto num valor ausente
 * derrubava a pagina inteira no boundary de /progress ao passar o mouse.
 */
interface TooltipPayloadItem {
  value?: number;
  payload?: {
    date?: string;
    fullDate?: string;
    averageScore?: number | null;
    scores?: Partial<FeedbackScores> | null;
  };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const scores = data.scores ?? {};

  return (
    <div
      data-testid="progress-charts-tooltip"
      className="bg-card border border-border rounded-lg p-3 shadow-md text-sm"
    >
      <p className="font-medium text-foreground mb-1">{data.fullDate ?? 'Data indisponivel'}</p>
      <p className="text-primary font-semibold">
        Media: {formatScore(data.averageScore)}/5
      </p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {DIMENSION_KEYS.map((key) => (
          <p key={key}>
            {DIMENSION_LABELS[key]}: {formatScore(scores[key])}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ProgressCharts({ feedbacks, isLoading }: ProgressChartsProps) {
  if (isLoading) {
    return (
      <div data-testid="progress-charts-loading" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-[200px] md:h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!feedbacks.length) {
    return (
      <div data-testid="progress-charts-empty-wrapper" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Evolucao da Media</h2>
        <EmptyState
          data-testid="progress-charts-empty"
          icon={TrendingUp}
          title="Sem dados de progresso"
          description="Faca suas primeiras avaliacoes para ver o progresso"
        />
      </div>
    );
  }

  const chartData = feedbacks.map((f) => ({
    date: formatDate(f.sessionDate),
    fullDate: formatFullDate(f.sessionDate),
    averageScore: toPoint(f.averageScore),
    scores: f.scores,
  }));

  return (
    <div
      className="bg-card border border-border rounded-2xl p-6 shadow-sm"
      aria-label="Grafico de evolucao da media"
    >
      <h2 className="font-semibold text-foreground mb-4">Evolucao da Media</h2>
      <div data-testid="progress-charts-canvas">
        <ResponsiveContainer width="100%" height={300} className="hidden md:block">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              domain={[0, 5]}
              tickCount={6}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke="#4F46E5"
              strokeWidth={2}
              dot={{ fill: '#4F46E5', r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={200} className="md:hidden">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              domain={[0, 5]}
              tickCount={6}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke="#4F46E5"
              strokeWidth={2}
              dot={{ fill: '#4F46E5', r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
