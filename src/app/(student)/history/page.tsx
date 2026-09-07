import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PAGINATION } from '@/lib/constants';
import { History } from 'lucide-react';
import { getSessions } from '@/actions/sessions';
import { HistoryClient } from './history-client';
import { DocumentSearch } from '@/components/session/DocumentSearch';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('history');
  return { title: t('metaTitle') };
}

interface HistoryPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

/**
 * Historico de aulas do aluno.
 *
 * A busca (`DocumentSearch`) mora AQUI, e nao na sala de aula, porque o que ela
 * consulta sao os cadernos ja fechados — `GET /api/v1/documents/search` varre o
 * `plainTextSnapshot` de sessoes passadas — e porque cada resultado leva a
 * `/history/{sessionId}/notes`, que e filha desta rota. Procurar "present
 * perfect" na lista paginada de aulas era, ate aqui, trabalho manual do aluno.
 */
export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = params.status || undefined;

  const [t, sessions] = await Promise.all([
    getTranslations('history'),
    getSessions({ page, limit: PAGINATION.STUDENT_HISTORY, status }),
  ]);

  return (
    <PageWrapper data-testid="page-history" className="max-w-4xl">
      <div data-testid="history-header" className="mb-6 flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      <div data-testid="history-search" className="mb-6">
        <DocumentSearch />
      </div>

      <HistoryClient
        sessions={sessions}
        currentPage={page}
        currentStatus={status ?? null}
      />
    </PageWrapper>
  );
}
