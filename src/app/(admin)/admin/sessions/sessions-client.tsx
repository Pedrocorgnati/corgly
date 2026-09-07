'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/session/SessionList';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

import type { AdminSessionsPageDto, FiltroFeedback } from './admin-sessions.contract';

/**
 * Contrato desta tela: o payload de `GET /api/v1/admin/sessions`, ja validado
 * por Zod em `fetch-admin-sessions.ts`.
 *
 * `studentName` e `score` sao OBRIGATORIOS aqui porque o produtor
 * (`sessionService.listAllForAdmin`) os emite em toda linha: `studentName` vem
 * da relacao obrigatoria `Session.student` e `score` e a media das 4 dimensoes
 * do feedback — `null` quando, e somente quando, a aula ainda nao foi avaliada.
 * Antes esta tela lia a rota generica `/api/v1/sessions`, que nao devolve
 * nenhum dos dois, e as colunas "Aluno" e "Score" caiam no traco em TODAS as
 * linhas.
 */
interface AdminSessionsClientProps {
  sessions: AdminSessionsPageDto;
  currentStatus: string | null;
  currentHasFeedback: FiltroFeedback;
}

const OPCOES_FEEDBACK: Array<{ valor: FiltroFeedback; rotulo: string; slug: string }> = [
  { valor: null, rotulo: 'Todas', slug: 'all' },
  { valor: true, rotulo: 'Com feedback', slug: 'with' },
  { valor: false, rotulo: 'Sem feedback', slug: 'without' },
];

export function AdminSessionsClient({
  sessions,
  currentStatus,
  currentHasFeedback,
}: AdminSessionsClientProps) {
  const router = useRouter();

  /**
   * Toda navegacao desta tela passa por aqui para que os filtros sobrevivam uns
   * aos outros: trocar de pagina nao pode perder o status, e trocar de filtro
   * nao pode manter a pagina antiga (o total muda).
   */
  const navegar = (destino: { page: number; status: string | null; hasFeedback: FiltroFeedback }) => {
    const params = new URLSearchParams();
    if (destino.status) params.set('status', destino.status);
    if (destino.hasFeedback !== null) params.set('hasFeedback', String(destino.hasFeedback));
    params.set('page', String(destino.page));
    router.push(`${ROUTES.ADMIN_SESSIONS}?${params.toString()}`);
  };

  const handlePageChange = (page: number) =>
    navegar({ page, status: currentStatus, hasFeedback: currentHasFeedback });

  const handleStatusFilter = (status: string | null) =>
    navegar({ page: 1, status, hasFeedback: currentHasFeedback });

  const handleFeedbackFilter = (hasFeedback: FiltroFeedback) =>
    navegar({ page: 1, status: currentStatus, hasFeedback });

  const handleSessionClick = (id: string) => {
    router.push(`${ROUTES.ADMIN_SESSIONS}/${id}`);
  };

  // Pagina pedida alem do fim (link antigo, `?page=99` na mao, filtro que
  // encolheu o total): a API devolve lista vazia com `total > 0`. Sem este
  // ramo a tabela mostrava "Nenhuma sessao encontrada" — mentira, ha sessoes,
  // so nao nesta pagina — e o botao de proxima ja nasce desabilitado, entao o
  // admin ficava sem saida. A pagina vigente e sempre a que a API confirmou
  // (`sessions.page`), nunca a que o navegador pediu.
  const foraDeAlcance = sessions.totalPages > 0 && sessions.page > sessions.totalPages;

  return (
    <div className="space-y-4">
      <div
        data-testid="admin-sessions-feedback-filter"
        className="bg-card border border-border rounded-2xl p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground mr-2">Feedback:</span>
          {OPCOES_FEEDBACK.map(({ valor, rotulo, slug }) => (
            <button
              key={slug}
              type="button"
              data-testid={`admin-sessions-feedback-filter-${slug}-button`}
              aria-pressed={currentHasFeedback === valor}
              onClick={() => handleFeedbackFilter(valor)}
              className={cn(
                'px-3 py-1 rounded-full text-xs border transition-colors',
                currentHasFeedback === valor
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <p data-testid="admin-sessions-score-legend" className="text-xs text-muted-foreground mt-3">
          Score é a média das quatro dimensões do feedback (escuta, fala, escrita e vocabulário),
          de 0 a 5. O traço na coluna Score significa aula ainda sem feedback registrado — use o
          filtro &ldquo;Sem feedback&rdquo; para listar só essas.
        </p>
      </div>

      {foraDeAlcance ? (
        <div
          data-testid="admin-sessions-out-of-range"
          className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center"
        >
          <p className="text-sm text-foreground">
            A página {sessions.page} não existe: esta listagem tem {sessions.totalPages}{' '}
            {sessions.totalPages === 1 ? 'página' : 'páginas'}.
          </p>
          <Button
            data-testid="admin-sessions-out-of-range-reset-button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => handlePageChange(1)}
          >
            Voltar para a primeira página
          </Button>
        </div>
      ) : (
        <SessionList
          sessions={sessions}
          onPageChange={handlePageChange}
          onStatusFilter={handleStatusFilter}
          currentStatusFilter={currentStatus}
          isLoading={false}
          onSessionClick={handleSessionClick}
        />
      )}
    </div>
  );
}
