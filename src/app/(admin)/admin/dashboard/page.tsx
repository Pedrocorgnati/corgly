import type { Metadata } from 'next';
import { Users, Calendar, CreditCard, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = {
  title: 'Admin — Dashboard',
};

// TODO: Implementar backend — GET /api/v1/admin/stats
const MOCK_STATS = {
  totalStudents: 0,
  activeStudents: 0,
  sessionsToday: 0,
  sessionsPending: 0,
  revenue: 0,
  avgScore: 0,
};

export default function AdminDashboardPage() {
  const stats = MOCK_STATS;

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da plataforma</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Alunos totais', value: stats.totalStudents, icon: Users, color: 'text-primary' },
          { label: 'Alunos ativos', value: stats.activeStudents, icon: TrendingUp, color: 'text-[#059669]' },
          { label: 'Aulas hoje', value: stats.sessionsToday, icon: Calendar, color: 'text-[#6366F1]' },
          { label: 'Pendentes', value: stats.sessionsPending, icon: Clock, color: 'text-[#D97706]' },
          { label: 'Receita (R$)', value: stats.revenue, icon: CreditCard, color: 'text-primary' },
          { label: 'Score médio', value: stats.avgScore || '—', icon: CheckCircle, color: 'text-[#059669]' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <stat.icon className={`h-5 w-5 ${stat.color} mb-2`} />
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-foreground mb-4">Próximas Aulas</h2>
          <EmptyState
            icon={Calendar}
            title="Nenhuma aula agendada"
            description="As próximas aulas aparecerão aqui após os alunos agendarem."
          />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-foreground mb-4">Atividade Recente</h2>
          <EmptyState
            icon={TrendingUp}
            title="Nenhuma atividade"
            description="As ações recentes de alunos aparecerão aqui."
          />
        </div>
      </div>
    </div>
  );
}
