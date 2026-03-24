'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

interface FeedbackScores {
  listening: number;
  speaking: number;
  writing: number;
  vocabulary: number;
}

interface DimensionRadarProps {
  scores: FeedbackScores | null;
  isLoading?: boolean;
}

const DIMENSIONS: Array<{ key: keyof FeedbackScores; label: string; color: string }> = [
  { key: 'listening',  label: 'Escuta',      color: '#4F46E5' },
  { key: 'speaking',   label: 'Fala',        color: '#6366F1' },
  { key: 'writing',    label: 'Escrita',     color: '#059669' },
  { key: 'vocabulary', label: 'Vocabulário', color: '#D97706' },
];

export function DimensionRadar({ scores, isLoading }: DimensionRadarProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
    );
  }

  if (!scores) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Perfil por Dimensao</h2>
        <EmptyState
          icon={BarChart3}
          title="Sem dados suficientes"
          description="Faca ao menos 3 avaliacoes para ver seu perfil"
        />
      </div>
    );
  }

  const data = DIMENSIONS.map((d) => ({
    dimension: d.label,
    value: scores[d.key],
  }));

  return (
    <div
      className="bg-card border border-border rounded-2xl p-6 shadow-sm"
      aria-label="Grafico radar de dimensoes"
    >
      <h2 className="font-semibold text-foreground mb-4">Perfil por Dimensao</h2>
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tickCount={6}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#4F46E5"
            fill="#4F46E5"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend with numeric values */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3" role="list">
        {DIMENSIONS.map((d) => (
          <div
            key={d.key}
            className="flex items-center gap-2 text-sm"
            role="listitem"
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              {d.label}:{' '}
              <span className="font-medium text-foreground">
                {scores[d.key].toFixed(1)}/5
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
