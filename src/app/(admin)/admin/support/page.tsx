import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LifeBuoy, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageWrapper } from '@/components/shared';
import { getAdminTickets } from '@/actions/admin-support';
import { ROUTES } from '@/lib/constants/routes';
import { PAGINATION } from '@/lib/constants';
import { formatDateTimePtBR } from '@/lib/format-datetime';
import { AdminSupportFilters } from '@/components/admin/support/AdminSupportFilters';
import { AdminTicketRowActions } from '@/components/admin/support/AdminTicketRowActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Suporte',
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Aberto', className: 'text-emerald-600 border-green-200 bg-green-50' },
  PENDING: { label: 'Aguardando', className: 'text-amber-600 border-amber-200 bg-amber-50' },
  RESOLVED: { label: 'Resolvido', className: 'text-muted-foreground border-border' },
  CLOSED: { label: 'Fechado', className: 'text-muted-foreground border-border' },
};

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Baixa', className: 'text-muted-foreground' },
  NORMAL: { label: 'Normal', className: 'text-muted-foreground' },
  HIGH: { label: 'Alta', className: 'text-amber-600 dark:text-amber-400' },
  URGENT: { label: 'Urgente', className: 'text-destructive font-semibold' },
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    priority?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

async function TicketsTable({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { tickets, error } = await getAdminTickets({
    page,
    limit: PAGINATION.DEFAULT,
    status: params.status || undefined,
    priority: params.priority || undefined,
    search: params.search || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
  });

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Não foi possível carregar os tickets.</p>
          <p className="text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  if (tickets.data.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="Nenhum ticket encontrado"
        description="Nenhum chamado corresponde aos filtros aplicados."
      />
    );
  }

  const buildPageHref = (target: number) => {
    const qs = new URLSearchParams();
    qs.set('page', String(target));
    if (params.status) qs.set('status', params.status);
    if (params.priority) qs.set('priority', params.priority);
    if (params.search) qs.set('search', params.search);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    return `${ROUTES.ADMIN_SUPPORT}?${qs.toString()}`;
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Assunto</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Aluno</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Prioridade</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Atualizado</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tickets.data.map((ticket) => {
              const status = STATUS_BADGE[ticket.status] ?? {
                label: ticket.status,
                className: 'text-muted-foreground border-border',
              };
              const priority = PRIORITY_BADGE[ticket.priority] ?? {
                label: ticket.priority,
                className: 'text-muted-foreground',
              };
              return (
                <tr key={ticket.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{ticket.subject}</p>
                    {ticket.lastMessage && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {ticket.lastMessage.preview}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{ticket.messageCount} msg</span>
                      {ticket.internalNoteCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {ticket.internalNoteCount} nota(s) interna(s)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {ticket.student ? (
                      <Link
                        href={ROUTES.ADMIN_STUDENT_NOTES(ticket.student.id)}
                        className="text-primary hover:underline"
                      >
                        {ticket.student.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className={`hidden px-4 py-3 sm:table-cell ${priority.className}`}>
                    {priority.label}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDateTimePtBR(ticket.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminTicketRowActions ticketId={ticket.id} status={ticket.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginação">
        <span className="text-muted-foreground">
          Página {tickets.page} de {Math.max(1, tickets.totalPages)} · {tickets.total} ticket(s)
        </span>
        <div className="flex gap-2">
          {tickets.page > 1 && (
            <Link
              href={buildPageHref(tickets.page - 1)}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
            >
              Anterior
            </Link>
          )}
          {tickets.page < tickets.totalPages && (
            <Link
              href={buildPageHref(tickets.page + 1)}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
            >
              Próxima
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}

export default async function AdminSupportPage(props: PageProps) {
  const params = await props.searchParams;

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Suporte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Caixa de entrada de chamados. Filtre, responda, feche e registre notas internas.
        </p>
      </div>

      <div className="mb-6">
        <AdminSupportFilters
          initial={{
            status: params.status ?? '',
            priority: params.priority ?? '',
            search: params.search ?? '',
            dateFrom: params.dateFrom ?? '',
            dateTo: params.dateTo ?? '',
          }}
        />
      </div>

      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted/30" />
        }
      >
        <TicketsTable searchParams={props.searchParams} />
      </Suspense>
    </PageWrapper>
  );
}
