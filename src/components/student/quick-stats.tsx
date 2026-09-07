import { CalendarCheck, CheckCircle2, Flame, History } from 'lucide-react';
import { WidgetCard } from '@/components/shared/widget-card';
import { cn } from '@/lib/utils';

interface QuickStatsProps {
  total: number;
  completedPercent: number;
  /**
   * Sequencia de semanas com aula. OPCIONAL de proposito: o dashboard nao tem
   * hoje uma fonte para esse numero (a rota `/api/v1/stats` calcula um
   * `currentStreak` que ninguem consome). Enquanto nao houver fonte, o widget
   * OMITE a metrica em vez de renderizar `0`, que seria dado fabricado — o
   * mesmo criterio aplicado aos demais widgets sem estado "desconhecido".
   */
  streak?: number;
  className?: string;
}

/**
 * Historico do aluno com o mesmo desenho das metricas do professor na
 * landing: glifo dentro de circulo de borda lilas, valor em tinta navy e
 * legenda em slate, separados por hairline vertical.
 */
export function QuickStats({ total, completedPercent, streak, className }: QuickStatsProps) {
  const stats = [
    { icon: CalendarCheck, value: String(total), label: 'Total de aulas' },
    { icon: CheckCircle2, value: `${completedPercent}%`, label: 'Concluídas' },
    ...(streak === undefined
      ? []
      : [{ icon: Flame, value: String(streak), label: 'Sequência (sem.)' }]),
  ];

  return (
    <WidgetCard
      data-testid="dashboard-kpi-quick-stats"
      title="Seu histórico"
      icon={History}
      className={className}
    >
      <ul
        className={cn(
          'grid grid-cols-1 gap-5',
          stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {stats.map(({ icon: Icon, value, label }, idx) => (
          <li key={label} className={idx === 0 ? '' : 'sm:border-l sm:border-border sm:pl-5'}>
            <p className="flex items-center gap-2.5 text-[1.35rem] font-semibold text-ink leading-none">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-200 text-brand-500 flex-shrink-0">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {value}
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground leading-snug pl-[3.25rem] sm:pl-0">
              {label}
            </p>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
