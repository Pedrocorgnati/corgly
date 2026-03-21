import { cn } from '@/lib/utils';

interface QuickStatsProps {
  total: number;
  completedPercent: number;
  streak: number;
  className?: string;
}

export function QuickStats({ total, completedPercent, streak, className }: QuickStatsProps) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-5 shadow-sm', className)}>
      <p className="text-sm font-medium text-muted-foreground mb-4">Seu histórico</p>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-[#6366F1]">{total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total de aulas</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-[#059669]">{completedPercent}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Concluídas</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-[#D97706]">{streak}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sequência (sem.)</p>
        </div>
      </div>
    </div>
  );
}
