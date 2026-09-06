import type { Metadata } from 'next';
import { CalendarDays, MessageSquare, Users } from 'lucide-react';
import { DashboardHeaderChip, DashboardPageHeader, PageWrapper } from '@/components/shared';
import { getAdminDashboard } from '@/actions/admin-dashboard';
import { TodayWidget } from '@/components/admin/TodayWidget';
import { PendingFeedbackWidget } from '@/components/admin/PendingFeedbackWidget';
import { ExpiringCreditsWidget } from '@/components/admin/ExpiringCreditsWidget';
import { StudentGrowthWidget } from '@/components/admin/StudentGrowthWidget';
import { MetricsPanel } from '@/components/admin/MetricsPanel';

export const metadata: Metadata = {
  title: 'Admin — Dashboard',
};

export default async function AdminDashboardPage() {
  const { data, error } = await getAdminDashboard();

  if (error || !data) {
    return (
      <PageWrapper data-testid="page-admin-dashboard">
        <div data-testid="admin-dashboard-error" className="card-corgly p-6">
          <p className="text-[13.5px] text-destructive">
            Erro ao carregar dados do dashboard: {error ?? 'Dados indisponíveis'}
          </p>
        </div>
      </PageWrapper>
    );
  }

  const todayTotal =
    data.today.scheduled + data.today.inProgress + data.today.completed + data.today.cancelled;

  return (
    <PageWrapper data-testid="page-admin-dashboard">
      {/* Mesma faixa lilas do hero da landing */}
      <DashboardPageHeader
        data-testid="admin-dashboard-header"
        eyebrow="Área do professor"
        title="Dashboard Admin"
        subtitle="Visão geral da plataforma."
        chips={
          <>
            <DashboardHeaderChip icon={Users} data-testid="admin-dashboard-header-chip-students">
              {data.totalStudents} aluno{data.totalStudents === 1 ? '' : 's'}
            </DashboardHeaderChip>
            <DashboardHeaderChip icon={CalendarDays} data-testid="admin-dashboard-header-chip-today">
              {todayTotal} aula{todayTotal === 1 ? '' : 's'} hoje
            </DashboardHeaderChip>
            <DashboardHeaderChip
              icon={MessageSquare}
              data-testid="admin-dashboard-header-chip-pending"
            >
              {data.pendingFeedbacks.count} feedback
              {data.pendingFeedbacks.count === 1 ? '' : 's'} pendente
              {data.pendingFeedbacks.count === 1 ? '' : 's'}
            </DashboardHeaderChip>
          </>
        }
      />

      {/* Metricas de periodo (cards dinamicos) */}
      <div data-testid="admin-dashboard-kpis">
        <MetricsPanel />
      </div>

      {/* Row 1: Today + Pending Feedbacks */}
      <div data-testid="admin-dashboard-cards-row-1" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TodayWidget today={data.today} />
        <PendingFeedbackWidget pendingFeedbacks={data.pendingFeedbacks} />
      </div>

      {/* Row 2: Expiring Credits + Student Growth */}
      <div data-testid="admin-dashboard-cards-row-2" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpiringCreditsWidget expiringCredits={data.expiringCredits} />
        <StudentGrowthWidget totalStudents={data.totalStudents} />
      </div>
    </PageWrapper>
  );
}
