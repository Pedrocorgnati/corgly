import type { Metadata } from 'next';
import { PAGINATION } from '@/lib/constants';
import { PageWrapper } from '@/components/shared';

import { AdminSessionsClient } from './sessions-client';
import { parseFiltroFeedback } from './admin-sessions.contract';
import { fetchAdminSessions } from './fetch-admin-sessions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Sessões',
};

interface AdminSessionsPageProps {
  searchParams: Promise<{ page?: string; status?: string; hasFeedback?: string }>;
}

/**
 * `?page=` chega como texto livre. `Number('abc')` e NaN e `Number('-3')` e
 * negativo; os dois viravam `skip` invalido no Prisma, a rota respondia 500 e a
 * tela mostrava "nenhuma sessao encontrada" — mentira. Qualquer coisa fora de
 * inteiro >= 1 volta para a pagina 1.
 */
function paginaPedida(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

export default async function AdminSessionsPage({ searchParams }: AdminSessionsPageProps) {
  const params = await searchParams;
  const page = paginaPedida(params.page);
  const status = params.status || undefined;
  const filtroFeedback = parseFiltroFeedback(params.hasFeedback);

  const resultado = await fetchAdminSessions({
    page,
    limit: PAGINATION.ADMIN_SESSIONS,
    status,
    hasFeedback: filtroFeedback ?? undefined,
  });

  return (
    <PageWrapper data-testid="page-admin-sessions">
      <div data-testid="admin-sessions-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Sessões</h1>
        <p className="text-sm text-muted-foreground mt-1">Todas as aulas da plataforma</p>
      </div>

      {resultado.kind === 'error' ? (
        <div
          data-testid="admin-sessions-fetch-error"
          className="bg-card border border-border rounded-2xl p-6 text-center"
        >
          <p className="text-sm text-destructive">
            Erro ao carregar as sessões: {resultado.message}
          </p>
        </div>
      ) : (
        <AdminSessionsClient
          sessions={resultado.sessions}
          currentStatus={status ?? null}
          currentHasFeedback={filtroFeedback}
        />
      )}
    </PageWrapper>
  );
}
