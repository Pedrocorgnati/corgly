'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/constants/routes';

interface CorglyCircleScores {
  clarity: number;
  didactics: number;
  punctuality: number;
  engagement: number;
}

interface CorglyCircleProps {
  scores: CorglyCircleScores | null;
  isLoading: boolean;
}

const DIMENSION_LABELS: Record<keyof CorglyCircleScores, string> = {
  clarity: 'Claridade',
  didactics: 'Didatica',
  punctuality: 'Pontualidade',
  engagement: 'Engajamento',
};

function mapScoresToData(scores: CorglyCircleScores) {
  return (Object.keys(DIMENSION_LABELS) as (keyof CorglyCircleScores)[]).map((key) => ({
    dimension: DIMENSION_LABELS[key],
    value: scores[key],
  }));
}

export function CorglyCircle({ scores, isLoading }: CorglyCircleProps) {
  if (isLoading) {
    return (
      <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-4">Corgly Circle</p>
        <Skeleton className="rounded-full h-[220px] w-full" />
      </div>
    );
  }

  if (!scores) {
    return (
      <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-4">Corgly Circle</p>
        <div className="flex items-center justify-center h-[220px] border-2 border-dashed border-border rounded-xl">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Complete suas primeiras sessoes para ver seu Corgly Circle</p>
          </div>
        </div>
        <Link href={ROUTES.PROGRESS} className="text-primary text-sm font-medium hover:underline mt-3 block">
          Ver progresso completo &rarr;
        </Link>
      </div>
    );
  }

  const data = mapScoresToData(scores);

  return (
    <div
      className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm"
      aria-label="Grafico de progresso por dimensao"
    >
      <p className="text-sm font-medium text-muted-foreground mb-4">Corgly Circle</p>
      <ResponsiveContainer width="100%" height={220}>
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
      <Link href={ROUTES.PROGRESS} className="text-primary text-sm font-medium hover:underline mt-3 block">
        Ver progresso completo &rarr;
      </Link>
    </div>
  );
}
