'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
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
  scores: FeedbackScores;
}

interface TrendLineChartProps {
  feedbacks: FeedbackEntry[];
  isLoading?: boolean;
}

type DimensionKey = keyof FeedbackScores;
type Period = '5' | '10' | 'all';

const DIMENSIONS: Array<{ key: DimensionKey; label: string; color: string }> = [
  { key: 'listening',  label: 'Escuta',      color: '#4F46E5' },
  { key: 'speaking',   label: 'Fala',        color: '#6366F1' },
  { key: 'writing',    label: 'Escrita',     color: '#059669' },
  { key: 'vocabulary', label: 'Vocabulário', color: '#D97706' },
];

const ALL_DIMENSION_KEYS: DimensionKey[] = DIMENSIONS.map((d) => d.key);

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '5', label: 'Ultimas 5' },
  { value: '10', label: 'Ultimas 10' },
  { value: 'all', label: 'Todas' },
];

/**
 * Recharts desenha um ponto por valor numerico e abre uma lacuna em `null`.
 * Nota ausente ou nao-finita vira lacuna — nunca NaN no eixo.
 */
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

export function TrendLineChart({ feedbacks, isLoading }: TrendLineChartProps) {
  const [visibleDimensions, setVisibleDimensions] = useState<Set<DimensionKey>>(
    () => new Set(ALL_DIMENSION_KEYS)
  );
  const [period, setPeriod] = useState<Period>('all');

  const chartData = useMemo(() => {
    const limit = period === '5' ? 5 : period === '10' ? 10 : feedbacks.length;
    const sliced = feedbacks.slice(-limit);
    return sliced.map((f) => ({
      date: formatDate(f.sessionDate),
      listening: toPoint(f.scores?.listening),
      speaking: toPoint(f.scores?.speaking),
      writing: toPoint(f.scores?.writing),
      vocabulary: toPoint(f.scores?.vocabulary),
    }));
  }, [feedbacks, period]);

  function toggleDimension(key: DimensionKey) {
    setVisibleDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div data-testid="progress-trend-chart-loading" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!feedbacks.length) {
    return (
      <div data-testid="progress-trend-chart-empty-wrapper" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Tendencia por Dimensao</h2>
        <EmptyState
          data-testid="progress-trend-chart-empty"
          icon={TrendingUp}
          title="Historico insuficiente"
          description="Historico insuficiente para exibir tendencias"
        />
      </div>
    );
  }

  const noneSelected = visibleDimensions.size === 0;

  return (
    <div
      data-testid="progress-trend-chart"
      className="bg-card border border-border rounded-2xl p-6 shadow-sm"
      aria-label="Grafico de tendencia por dimensao"
    >
      <div data-testid="progress-trend-chart-header" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-semibold text-foreground">Tendencia por Dimensao</h2>

        {/* Period selector */}
        <div data-testid="progress-trend-chart-filter-bar" className="flex gap-1 bg-muted rounded-lg p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              data-testid={`progress-trend-chart-filter-${opt.value}-button`}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === opt.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dimension toggles */}
      <div data-testid="progress-trend-chart-dimensions" className="flex flex-wrap gap-3 mb-4">
        {DIMENSIONS.map((d) => (
          <label
            key={d.key}
            data-testid={`progress-trend-chart-dimension-${d.key}`}
            className="flex items-center gap-2 text-sm cursor-pointer select-none"
          >
            <input
              data-testid={`progress-trend-chart-dimension-${d.key}-checkbox`}
              type="checkbox"
              checked={visibleDimensions.has(d.key)}
              onChange={() => toggleDimension(d.key)}
              className="sr-only"
              aria-label={`Mostrar/ocultar ${d.label}`}
            />
            <span
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                visibleDimensions.has(d.key)
                  ? 'border-transparent'
                  : 'border-border bg-transparent'
              }`}
              style={
                visibleDimensions.has(d.key)
                  ? { backgroundColor: d.color, borderColor: d.color }
                  : undefined
              }
              aria-hidden="true"
            >
              {visibleDimensions.has(d.key) && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="text-muted-foreground">{d.label}</span>
          </label>
        ))}
      </div>

      {noneSelected ? (
        <div data-testid="progress-trend-chart-none-selected" className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
          Selecione ao menos uma dimensao
        </div>
      ) : (
        <div data-testid="progress-trend-chart-canvas">
          <ResponsiveContainer width="100%" height={300}>
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
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend />
              {DIMENSIONS.filter((d) => visibleDimensions.has(d.key)).map((d) => (
                <Line
                  key={d.key}
                  type="monotone"
                  dataKey={d.key}
                  name={d.label}
                  stroke={d.color}
                  strokeWidth={2}
                  dot={{ fill: d.color, r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
