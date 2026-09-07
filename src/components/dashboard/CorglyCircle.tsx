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
import { Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';
import type { FeedbackScores } from '@/actions/dashboard';

/**
 * Dimensoes do Corgly Circle.
 *
 * Vocabulario canonico do backend — listening/speaking/writing/vocabulary
 * (prisma/schema.prisma, src/schemas/feedback.schema.ts,
 * src/services/feedback.service.ts). As dimensoes antigas
 * (clarity/didactics/punctuality/engagement) NAO existem em lugar nenhum da
 * API: o grafico recebia `undefined` em todo raio, colapsava no centro e
 * sobrava so o rotulo. Rotulos iguais aos de src/components/progress/*.
 */
const DIMENSIONS: Array<{ key: keyof FeedbackScores; label: string }> = [
  { key: 'listening', label: 'Escuta' },
  { key: 'speaking', label: 'Fala' },
  { key: 'writing', label: 'Escrita' },
  { key: 'vocabulary', label: 'Vocabulário' },
];

/** Recharts abre lacuna em `null`; nota invalida nunca vira vertice no radar. */
function toPoint(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Nota ausente ou nao-finita vira travessao na leitura numerica — nunca `NaN`.
 *
 * Mesmo helper de src/components/progress/DimensionRadar.tsx: a API pode
 * devolver `null` numa dimensao sem feedback e `FeedbackScores` nao garante
 * finitude em tempo de execucao. Sem isto a legenda imprimia "NaN/5".
 */
function formatScore(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}/5` : '—';
}

interface CorglyCircleProps {
  scores: FeedbackScores | null;
  isLoading: boolean;
  /** Span na grade do dashboard. A GRADE manda no span; o card nao decide. */
  className?: string;
}

function ProgressLink() {
  return (
    <Link
      href={ROUTES.PROGRESS}
      className="text-brand-500 text-[13.5px] font-semibold hover:underline"
    >
      Ver progresso completo &rarr;
    </Link>
  );
}

export function CorglyCircle({ scores, isLoading, className }: CorglyCircleProps) {
  if (isLoading) {
    return (
      <WidgetCard
        data-testid="dashboard-corgly-circle"
        title="Corgly Circle"
        icon={Target}
        className={className}
      >
        <Skeleton className="rounded-full h-[220px] w-full" />
      </WidgetCard>
    );
  }

  if (!scores) {
    return (
      <WidgetCard
        data-testid="dashboard-corgly-circle"
        title="Corgly Circle"
        icon={Target}
        className={className}
        footer={<ProgressLink />}
      >
        <div className="flex items-center justify-center h-[220px] border-2 border-dashed border-brand-200 rounded-lg">
          <p className="text-[13.5px] text-muted-foreground text-center px-6">
            Complete suas primeiras sessoes para ver seu Corgly Circle
          </p>
        </div>
      </WidgetCard>
    );
  }

  const data = DIMENSIONS.map((dimension) => ({
    dimension: dimension.label,
    value: toPoint(scores[dimension.key]),
  }));

  return (
    <WidgetCard
      data-testid="dashboard-corgly-circle"
      aria-label="Grafico de progresso por dimensao"
      title="Corgly Circle"
      icon={Target}
      className={className}
      footer={<ProgressLink />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          {/* Os tokens de cor sao HEX (src/app/globals.css), nao triplas HSL:
              `hsl(var(--border))` gera CSS invalido e apaga o traco do eixo.
              Consumir a variavel direta. */}
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tickCount={6}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="var(--brand-500)"
            fill="var(--brand-500)"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Leitura numerica: o SVG do recharts nao e legivel por leitor de tela e
          o poligono sozinho nao diz o valor de cada dimensao. */}
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {DIMENSIONS.map((dimension) => (
          <li key={dimension.key} className="text-[12.5px] text-muted-foreground">
            {dimension.label}:{' '}
            <span className="font-semibold text-ink">
              {formatScore(scores[dimension.key])}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
