import type { Metadata } from 'next';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = {
  title: 'Admin — Relatórios',
};

// TODO: Implementar backend — GET /api/v1/admin/reports
export default function AdminReportsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Métricas e análises da plataforma</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          'Receita mensal',
          'Satisfação dos alunos',
          'Aulas por mês',
          'Retenção de alunos',
        ].map((report) => (
          <div key={report} className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-foreground mb-4">{report}</h3>
            <div className="flex items-center justify-center h-40 border-2 border-dashed border-border rounded-xl">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Dados disponíveis após integração</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
