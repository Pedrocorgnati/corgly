'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Search, Loader2, FileText } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

/** Endpoint da busca. Nao ha entrada correspondente em `constants/routes.ts`. */
const SEARCH_ENDPOINT = '/api/v1/documents/search';
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 350;
const MIN_TERM_LENGTH = 2;

interface SearchHit {
  id: string;
  sessionId: string;
  updatedAt: string;
  session: {
    id: string;
    startAt: string;
    status: string;
    studentName: string | null;
  };
  snippet: string;
}

interface SearchResponse {
  data: SearchHit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Desfecho de UMA busca, carimbado com o termo e a pagina que o produziram.
 *
 * O carimbo e o que impede resultado obsoleto na tela: quando o aluno digita
 * mais uma letra, o desfecho anterior deixa de casar com o termo atual e o
 * componente volta sozinho para o estado de carregamento — sem precisar
 * "limpar" estado dentro de efeito, que e o que gera render em cascata.
 */
interface SearchOutcome {
  term: string;
  page: number;
  result: { kind: 'ready'; body: SearchResponse } | { kind: 'error'; message: string };
}

interface DocumentSearchProps {
  className?: string;
}

/**
 * Busca com debounce nos SessionDocuments visiveis ao usuario.
 *
 * Consome `GET /api/v1/documents/search` pelo `apiClient` (contrato do modulo:
 * componente nao chama `fetch` direto), o que traz de graca cookie httpOnly,
 * timeout de 30s e mensagem de erro ja traduzida pelo catalogo de erros. O
 * RBAC fica no servidor: o aluno so ve as proprias aulas.
 *
 * Cada resultado leva ao caderno read-only da aula (`/history/{id}/notes`),
 * unica tela que renderiza o documento encontrado — o `bookingId` da rota
 * resolve para `Session.id`, o mesmo id que a busca devolve em `hit.sessionId`.
 *
 * Estados idle, loading, empty, error e success sao todos renderizaveis.
 * Copy: namespace `documentSearch` (paginacao reaproveita `pagination`).
 */
export function DocumentSearch({ className }: DocumentSearchProps) {
  const t = useTranslations('documentSearch');
  const tPagination = useTranslations('pagination');
  const locale = useLocale();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);

  const term = q.trim();
  const isActive = term.length >= MIN_TERM_LENGTH;

  // A copy do erro generico e resolvida no render (assim a varredura de chaves
  // consumidas enxerga `errorUnknown` como literal) e entra no efeito pelo ref,
  // para que trocar de idioma nao reinicie a busca em andamento.
  const erroDesconhecido = t('errorUnknown');
  const erroDesconhecidoRef = useRef(erroDesconhecido);
  useEffect(() => {
    erroDesconhecidoRef.current = erroDesconhecido;
  });

  useEffect(() => {
    if (!isActive) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      apiClient
        .get<{ data: SearchResponse }>(SEARCH_ENDPOINT, {
          params: { q: term, page, limit: PAGE_SIZE },
          signal: ctrl.signal,
        })
        .then((body) => {
          setOutcome({ term, page, result: { kind: 'ready', body: body.data } });
        })
        .catch((error: unknown) => {
          // Busca substituida por outra tecla: cancelamento deliberado NAO e
          // erro de usuario. O timeout interno do apiClient tambem chega como
          // abort, mas sem marcar ESTE controller — e esse continua visivel.
          if (ctrl.signal.aborted) return;
          const raw = error instanceof Error && error.message ? error.message : '';
          setOutcome({
            term,
            page,
            result: { kind: 'error', message: raw || erroDesconhecidoRef.current },
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, page, isActive]);

  // Desfecho valido para o par (termo, pagina) atual. Enquanto nao houver um,
  // a busca esta em andamento — e nunca se ve o resultado do termo anterior.
  const current = outcome && outcome.term === term && outcome.page === page ? outcome.result : null;
  const isLoading = isActive && current === null;
  const resp = current?.kind === 'ready' ? current.body : null;
  // Digitou algo, mas ainda e curto demais para consultar o servidor: dizer
  // isso e melhor que nao reagir a tecla nenhuma.
  const showMinChars = term.length > 0 && !isActive;

  return (
    <div data-testid="document-search" className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid="document-search-input"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t('placeholder')}
          aria-label={t('ariaLabel')}
          className="h-10 w-full rounded-md border bg-background pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {isLoading && (
          <Loader2 data-testid="document-search-input-loading" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showMinChars && (
        <p data-testid="document-search-min-chars" className="mt-1 text-xs text-muted-foreground">
          {t('minChars', { min: MIN_TERM_LENGTH })}
        </p>
      )}

      {isActive && (
        <div data-testid="document-search-results" className="absolute z-20 mt-1 max-h-[60vh] w-full overflow-auto rounded-md border bg-popover shadow-md">
          {isLoading && (
            <div data-testid="document-search-loading" className="p-3 text-sm text-muted-foreground">
              {t('searching')}
            </div>
          )}
          {current?.kind === 'error' && (
            <div data-testid="document-search-error" className="p-3 text-sm text-destructive">
              {t('error', { message: current.message })}
            </div>
          )}
          {resp && resp.data.length === 0 && (
            <div data-testid="document-search-empty" className="p-3 text-sm text-muted-foreground">
              {t('empty', { query: term })}
            </div>
          )}
          {resp && resp.data.length > 0 && (
            <ul data-testid="document-search-list" className="divide-y">
              {resp.data.map((hit) => (
                <li key={hit.id} data-testid={`document-search-item-${hit.id}`}>
                  <Link
                    data-testid={`document-search-item-${hit.id}-link`}
                    href={`${ROUTES.HISTORY}/${hit.sessionId}/notes`}
                    className="block px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{new Date(hit.session.startAt).toLocaleString(locale)}</span>
                      {hit.session.studentName && <span>• {hit.session.studentName}</span>}
                    </div>
                    <p
                      className="mt-1 text-sm"
                      // Snippet ja sanitizado no servidor; somente <mark> permitido.
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {resp && resp.totalPages > 1 && (
            <div data-testid="document-search-pagination" className="flex items-center justify-between border-t px-3 py-2 text-xs">
              <button
                data-testid="document-search-pagination-prev-button"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="disabled:opacity-50"
              >
                {`← ${tPagination('prev')}`}
              </button>
              <span className="text-muted-foreground">
                {t('pageStatus', {
                  page: resp.page,
                  totalPages: resp.totalPages,
                  total: resp.total,
                })}
              </span>
              <button
                data-testid="document-search-pagination-next-button"
                type="button"
                onClick={() => setPage((p) => Math.min(resp.totalPages, p + 1))}
                disabled={page >= resp.totalPages}
                className="disabled:opacity-50"
              >
                {`${tPagination('next')} →`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
