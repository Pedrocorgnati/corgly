import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { getAdminDashboard } from '@/actions/admin-dashboard';
import { TodayWidget } from '@/components/admin/TodayWidget';
import { PendingFeedbackWidget } from '@/components/admin/PendingFeedbackWidget';
import { ExpiringCreditsWidget } from '@/components/admin/ExpiringCreditsWidget';
import { StudentGrowthWidget } from '@/components/admin/StudentGrowthWidget';

export const metadata: Metadata = {
  title: 'Admin — Dashboard',
};

export default async function AdminDashboardPage() {
  const { data, error } = await getAdminDashboard();

  if (error || !data) {
    return (
      <PageWrapper>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-destructive">
            Erro ao carregar dados do dashboard: {error ?? 'Dados indisponíveis'}
          </p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da plataforma</p>
      </div>

      {/* Row 1: Today + Pending Feedbacks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TodayWidget today={data.today} />
        <PendingFeedbackWidget pendingFeedbacks={data.pendingFeedbacks} />
      </div>

      {/* Row 2: Expiring Credits + Student Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpiringCreditsWidget expiringCredits={data.expiringCredits} />
        <StudentGrowthWidget totalStudents={data.totalStudents} />
      </div>
    </PageWrapper>
  );
}
