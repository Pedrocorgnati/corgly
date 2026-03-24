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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

interface TooltipPayloadItem {
  value: number;
  payload: {
    date: string;
    fullDate: string;
    averageScore: number;
    scores: FeedbackScores;
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
  const data = payload[0].payload;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium text-foreground mb-1">{data.fullDate}</p>
      <p className="text-primary font-semibold">
        Media: {data.averageScore.toFixed(1)}/5
      </p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {(Object.keys(DIMENSION_LABELS) as (keyof FeedbackScores)[]).map((key) => (
          <p key={key}>
            {DIMENSION_LABELS[key]}: {data.scores[key].toFixed(1)}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ProgressCharts({ feedbacks, isLoading }: ProgressChartsProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-[200px] md:h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!feedbacks.length) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Evolucao da Media</h2>
        <EmptyState
          icon={TrendingUp}
          title="Sem dados de progresso"
          description="Faca suas primeiras avaliacoes para ver o progresso"
        />
      </div>
    );
  }

  const chartData = feedbacks.map((f) => ({
    date: formatDate(f.sessionDate),
    fullDate: new Date(f.sessionDate).toLocaleDateString('pt-BR'),
    averageScore: f.averageScore,
    scores: f.scores,
  }));

  return (
    <div
      className="bg-card border border-border rounded-2xl p-6 shadow-sm"
      aria-label="Grafico de evolucao da media"
    >
      <h2 className="font-semibold text-foreground mb-4">Evolucao da Media</h2>
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
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
