'use client';

import { useRouter } from 'next/navigation';
import {
  LifeBuoy,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';
import type { PaginatedTickets } from '@/lib/support/ticket.types';

/**
 * ST-37/ST-38/ST-39: listagem dos chamados de suporte do próprio aluno.
 *
 * Trata explicitamente os quatro estados globais exigidos pela acceptance:
 *  - error    -> banner de erro com retry (router.refresh);
 *  - empty    -> EmptyState com CTA para abrir o primeiro chamado;
 *  - success  -> cards com status/prioridade + preview da última mensagem;
 *  - loading  -> coberto pelo Server Component pai (streaming/Suspense) e pelo
 *                feedback de navegação ao filtrar/paginar.
 *
 * O histórico/status fica inline (status badge + última mensagem + contagem),
 * sem link para uma página de detalhe inexistente nesta entrega, evitando deadend
 * (a thread completa de mensagens é T-067).
 */

const STATUS_FILTERS = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'PENDING', label: 'Aguardando' },
  { value: 'RESOLVED', label: 'Resolvido' },
  { value: 'CLOSED', label: 'Fechado' },
] as const;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Aberto', className: 'bg-primary/10 text-primary' },
  PENDING: { label: 'Aguardando', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  RESOLVED: { label: 'Resolvido', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  CLOSED: { label: 'Fechado', className: 'bg-muted text-muted-foreground' },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Baixa', className: 'text-muted-foreground' },
  NORMAL: { label: 'Normal', className: 'text-muted-foreground' },
  HIGH: { label: 'Alta', className: 'text-amber-600 dark:text-amber-400' },
  URGENT: { label: 'Urgente', className: 'text-destructive' },
};

const AUTHOR_LABEL: Record<string, string> = {
  STUDENT: 'Você',
  ADMIN: 'Suporte',
  SYSTEM: 'Sistema',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SupportTicketListProps {
  tickets: PaginatedTickets;
  currentPage: number;
  currentStatus: string | null;
  loadError: string | null;
}

export function SupportTicketList({
  tickets,
  currentPage,
  currentStatus,
  loadError,
}: SupportTicketListProps) {
  const router = useRouter();

  const handleStatusFilter = (status: string | null) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('page', '1');
    router.push(`${ROUTES.SUPPORT}?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams();
    if (currentStatus) params.set('status', currentStatus);
    params.set('page', String(page));
    router.push(`${ROUTES.SUPPORT}?${params.toString()}`);
  };

  // Estado de erro: a leitura falhou no servidor (rede/API). Mostra mensagem
  // explícita + retry, nunca uma tela em branco (Zero Silêncio).
  if (loadError) {
    return (
      <div data-testid="support-list-error" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <h3 className="text-base font-semibold text-foreground">
          Não foi possível carregar seus chamados
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{loadError}</p>
        <Button data-testid="support-list-retry-button" size="sm" variant="outline" className="mt-4" onClick={() => router.refresh()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const data = tickets?.data ?? [];
  const totalPages = tickets?.totalPages ?? 0;

  return (
    <>
      {/* Filtros por status */}
      <div data-testid="support-status-filters" className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!currentStatus}
          onClick={() => handleStatusFilter(null)}
          data-testid="support-status-filter-all"
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs transition-colors',
            !currentStatus
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:border-primary',
          )}
        >
          Todos
        </button>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={currentStatus === filter.value}
            onClick={() => handleStatusFilter(filter.value)}
            data-testid={`support-status-filter-${filter.value}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs transition-colors',
              currentStatus === filter.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Estado vazio */}
      {data.length === 0 ? (
        <EmptyState
          data-testid="support-list-empty"
          icon={LifeBuoy}
          title={
            currentStatus
              ? 'Nenhum chamado com esse status'
              : 'Você ainda não abriu chamados'
          }
          description={
            currentStatus
              ? 'Ajuste o filtro acima para ver outros chamados.'
              : 'Precisa de ajuda? Abra um chamado e nossa equipe responde por aqui.'
          }
          actionLabel={currentStatus ? undefined : 'Abrir chamado'}
          actionHref={currentStatus ? undefined : ROUTES.SUPPORT_NEW}
        />
      ) : (
        <ul data-testid="support-ticket-list" className="space-y-3">
          {data.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status] ?? {
              label: ticket.status,
              className: 'bg-muted text-muted-foreground',
            };
            const priorityCfg = PRIORITY_CONFIG[ticket.priority] ?? {
              label: ticket.priority,
              className: 'text-muted-foreground',
            };

            return (
              <li
                key={ticket.id}
                data-testid={`support-ticket-${ticket.id}`}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-foreground">{ticket.subject}</h3>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      statusCfg.className,
                    )}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                {ticket.lastMessage && (
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {AUTHOR_LABEL[ticket.lastMessage.authorRole] ?? ticket.lastMessage.authorRole}:
                    </span>{' '}
                    {ticket.lastMessage.preview}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn('font-medium', priorityCfg.className)}>
                    Prioridade: {priorityCfg.label}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {ticket.messageCount}{' '}
                    {ticket.messageCount === 1 ? 'mensagem' : 'mensagens'}
                  </span>
                  <span>Atualizado em {formatDate(ticket.updatedAt)}</span>
                  {ticket.resolvedAt && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolvido em {formatDate(ticket.resolvedAt)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div data-testid="support-pagination" className="mt-6 flex items-center justify-center gap-3">
          <Button
            data-testid="support-pagination-prev-button"
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            data-testid="support-pagination-next-button"
            size="sm"
            variant="outline"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="gap-1"
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
