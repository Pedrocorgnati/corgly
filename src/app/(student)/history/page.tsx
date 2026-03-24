import type { Metadata } from 'next';
import { PAGINATION } from '@/lib/constants';
import { History } from 'lucide-react';
import { getSessions } from '@/actions/sessions';
import { HistoryClient } from './history-client';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Histórico de Aulas',
};

interface HistoryPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = params.status || undefined;

  const sessions = await getSessions({ page, limit: PAGINATION.STUDENT_HISTORY, status });

  return (
    <PageWrapper className="max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Aulas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Todas as suas sessões anteriores</p>
        </div>
      </div>

      <HistoryClient
        sessions={sessions}
        currentPage={page}
        currentStatus={status ?? null}
      />
    </PageWrapper>
  );
}
