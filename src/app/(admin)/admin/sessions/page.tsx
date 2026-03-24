import type { Metadata } from 'next';
import { PAGINATION } from '@/lib/constants';
import { getSessions } from '@/actions/sessions';
import { AdminSessionsClient } from './sessions-client';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Admin — Sessões',
};

interface AdminSessionsPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function AdminSessionsPage({ searchParams }: AdminSessionsPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = params.status || undefined;

  const sessions = await getSessions({ page, limit: PAGINATION.ADMIN_SESSIONS, status });

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Sessões</h1>
        <p className="text-sm text-muted-foreground mt-1">Todas as aulas da plataforma</p>
      </div>

      <AdminSessionsClient
        sessions={sessions}
        currentPage={page}
        currentStatus={status ?? null}
      />
    </PageWrapper>
  );
}
