'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
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

interface DimensionRadarProps {
  scores: FeedbackScores | null;
  isLoading?: boolean;
}

/**
 * Ate 2026-09-07 o nome de cada dimensao morava aqui em portugues cravado, fora do
 * alcance do next-intl. Sobrou o que nao tem idioma: a chave (que tambem indexa o
 * catalogo em `progress.dimensions.*`) e a cor da serie.
 */
const DIMENSIONS: Array<{ key: keyof FeedbackScores; color: string }> = [
  { key: 'listening',  color: '#4F46E5' },
  { key: 'speaking',   color: '#6366F1' },
  { key: 'writing',    color: '#059669' },
  { key: 'vocabulary', color: '#D97706' },
];

/** Recharts abre lacuna em `null`; nota invalida nunca vira vertice no radar. */
function toPoint(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Nota ausente ou nao-finita vira travessao na legenda — nunca `NaN`. */
function formatScore(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}/5` : '—';
}

export function DimensionRadar({ scores, isLoading }: DimensionRadarProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('progress');

  if (isLoading) {
    return (
      <div data-testid="progress-dimension-radar-loading" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
    );
  }

  if (!scores) {
    return (
      <div data-testid="progress-dimension-radar-empty-wrapper" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">{t('radar.title')}</h2>
        <EmptyState
          data-testid="progress-dimension-radar-empty"
          icon={BarChart3}
          title={t('radar.empty')}
          description={t('radar.emptyDesc')}
        />
      </div>
    );
  }

  const data = DIMENSIONS.map((d) => ({
    dimension: t(`dimensions.${d.key}`),
    value: toPoint(scores[d.key]),
  }));

  return (
    <div
      data-testid="progress-dimension-radar"
      className="bg-card border border-border rounded-2xl p-6 shadow-sm"
      aria-label={t('radar.chartAria')}
    >
      <h2 className="font-semibold text-foreground mb-4">{t('radar.title')}</h2>
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
            data-testid={`progress-dimension-radar-legend-${d.key}`}
            className="flex items-center gap-2 text-sm"
            role="listitem"
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              {t(`dimensions.${d.key}`)}:{' '}
              <span className="font-medium text-foreground">
                {formatScore(scores[d.key])}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
