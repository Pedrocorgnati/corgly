import type { Metadata } from 'next';
import { BarChart3, TrendingUp } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Meu Progresso',
};

// TODO: Implementar backend — GET /api/v1/progress
async function ProgressContent() {
  // Returns empty until backend is implemented
  return (
    <EmptyState
      icon={TrendingUp}
      title="Nenhum dado de progresso ainda"
      description="Complete suas primeiras sessões para visualizar seu Corgly Circle e gráficos de evolução."
    />
  );
}

export default function ProgressPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Progresso</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe sua evolução em português</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Aulas concluídas', value: '0', color: 'text-primary' },
          { label: 'Horas estudadas', value: '0h', color: 'text-[#059669]' },
          { label: 'Nota média', value: '—', color: 'text-[#6366F1]' },
          { label: 'Sequência', value: '0 sem.', color: 'text-[#D97706]' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Radar chart placeholder */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Corgly Circle</h2>
        <div className="flex items-center justify-center h-[280px] border-2 border-dashed border-border rounded-xl">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">O gráfico de habilidades aparecerá aqui</p>
            <p className="text-xs mt-1">Claridade · Didática · Pontualidade · Engajamento</p>
          </div>
        </div>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        <ProgressContent />
      </Suspense>
    </div>
  );
}
