import { Users, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentGrowthWidgetProps {
  totalStudents: number;
}

export function StudentGrowthWidget({ totalStudents }: StudentGrowthWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-foreground">Alunos</h2>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-bold text-foreground">{totalStudents}</span>
        <span className="text-sm text-muted-foreground">cadastrados</span>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 flex flex-col items-center justify-center text-center">
        <TrendingUp className="h-6 w-6 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">
          Gráfico de crescimento disponível em breve
        </p>
      </div>
    </div>
  );
}
