import { Users, TrendingUp } from 'lucide-react';
import { WidgetCard } from '@/components/shared/widget-card';

interface StudentGrowthWidgetProps {
  totalStudents: number;
}

export function StudentGrowthWidget({ totalStudents }: StudentGrowthWidgetProps) {
  return (
    <WidgetCard title="Alunos" icon={Users}>
      {/* Numero grande em tinta navy, como o preco dos planos da landing. */}
      <div className="flex items-baseline gap-2 mb-5">
        <span className="text-[2.75rem] font-bold tracking-tight text-ink leading-none">
          {totalStudents}
        </span>
        <span className="text-[13px] text-muted-foreground">cadastrados</span>
      </div>

      <div className="rounded-lg border border-dashed border-brand-200 bg-brand-50 p-5 flex flex-col items-center justify-center text-center">
        <TrendingUp className="h-6 w-6 text-brand-400 mb-2" />
        <p className="text-[12.5px] text-muted-foreground">
          Gráfico de crescimento disponível em breve
        </p>
      </div>
    </WidgetCard>
  );
}
