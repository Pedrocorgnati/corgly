import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LifeBuoy, Plus } from 'lucide-react';
import { PAGINATION } from '@/lib/constants';
import { ROUTES } from '@/lib/constants/routes';
import { getSupportTickets } from '@/actions/support';
import { PageWrapper } from '@/components/shared';
import { SupportTicketList } from '@/components/support/SupportTicketList';
import { ButtonLink } from '@/components/ui/button-link';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.support');
  return { title: t('metaTitle') };
}

interface SupportPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

/**
 * ST-37/ST-38: central de suporte do aluno.
 *
 * Lista os chamados do próprio aluno (status + última mensagem) e dá o ponto de
 * entrada para abrir um novo chamado (`/support/new`). O histórico/status fica
 * inline na listagem (não há página de detalhe separada nesta entrega: a
 * thread completa de mensagens chega em T-067), então a listagem é o único
 * destino, sem deadends.
 */
export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = params.status || undefined;

  const t = await getTranslations('pages.support');

  const { tickets, error } = await getSupportTickets({
    page,
    limit: PAGINATION.STUDENT_HISTORY,
    status,
  });

  return (
    <PageWrapper data-testid="page-support" className="max-w-4xl">
      <div data-testid="support-header" className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        <ButtonLink href={ROUTES.SUPPORT_NEW} size="sm" className="gap-1.5" data-testid="support-new-ticket-button">
          <Plus className="h-4 w-4" />
          {t('newTicket')}
        </ButtonLink>
      </div>

      <SupportTicketList
        tickets={tickets}
        currentPage={page}
        currentStatus={status ?? null}
        loadError={error}
      />
    </PageWrapper>
  );
}
