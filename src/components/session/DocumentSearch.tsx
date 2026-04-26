'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface DocumentSearchProps {
  className?: string;
  /** Rota base para o link do resultado. Default: /sessions/{sessionId} */
  buildHref?: (hit: SearchHit) => string;
  placeholder?: string;
}

/**
 * DocumentSearch — busca com debounce em SessionDocuments do usuario.
 * Estados: idle, loading, empty, error, success (todos renderizaveis — Zero Estados Indefinidos).
 */
export function DocumentSearch({
  className,
  buildHref,
  placeholder = 'Buscar nos documentos das aulas…',
}: DocumentSearchProps) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setState('idle');
      setResp(null);
      setErr(null);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState('loading');
      setErr(null);

      const url = `/api/v1/documents/search?q=${encodeURIComponent(term)}&page=${page}&limit=10`;
      fetch(url, { signal: ctrl.signal })
        .then(async (r) => {
          const json = await r.json();
          if (!r.ok) throw new Error(json?.error ?? 'Falha na busca');
          return json;
        })
        .then((json) => {
          setResp(json.data ?? json);
          setState('ready');
        })
        .catch((e) => {
          if (e.name === 'AbortError') return;
          setErr(e.message ?? 'Erro desconhecido');
          setState('error');
        });
    }, 350);

    return () => clearTimeout(t);
  }, [q, page]);

  const hrefOf = (hit: SearchHit) =>
    buildHref ? buildHref(hit) : `/sessions/${hit.sessionId}`;

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={placeholder}
          aria-label="Buscar nos documentos das aulas"
          className="h-10 w-full rounded-md border bg-background pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {state === 'loading' && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-[60vh] w-full overflow-auto rounded-md border bg-popover shadow-md">
          {state === 'loading' && (
            <div className="p-3 text-sm text-muted-foreground">Buscando…</div>
          )}
          {state === 'error' && (
            <div className="p-3 text-sm text-destructive">Erro: {err}</div>
          )}
          {state === 'ready' && resp && resp.data.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              Nenhum resultado para “{q}”.
            </div>
          )}
          {state === 'ready' && resp && resp.data.length > 0 && (
            <ul className="divide-y">
              {resp.data.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={hrefOf(hit)}
                    className="block px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>
                        {new Date(hit.session.startAt).toLocaleString('pt-BR')}
                      </span>
                      {hit.session.studentName && (
                        <span>• {hit.session.studentName}</span>
                      )}
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
          {state === 'ready' && resp && resp.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="disabled:opacity-50"
              >
                ← Anterior
              </button>
              <span className="text-muted-foreground">
                Pagina {resp.page} de {resp.totalPages} ({resp.total} resultados)
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(resp.totalPages, p + 1))}
                disabled={page >= resp.totalPages}
                className="disabled:opacity-50"
              >
                Proxima →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentSearch;
