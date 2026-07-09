'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

/**
 * TermsAcceptanceGate (GL-19 / T-046)
 *
 * Bloqueia o acesso ao dashboard enquanto o usuario autenticado nao registrar o
 * aceite da `version` ATIVA dos termos. O criterio de bloqueio e a versao (nao
 * timestamp); `required_since` so aparece como metadado informativo.
 *
 * Ponto de montagem unico: layout autenticado, apos a resolucao da sessao e
 * antes de renderizar `children`. Nao deve ser montado em outras rotas.
 *
 * Estados (Zero Estados Indefinidos / Zero Silencio):
 *  - loading  : skeleton; nunca renderiza `children` antes da resolucao.
 *  - error    : tela de erro com retry; nao libera o acesso por falha.
 *  - blocked  : modal com o documento + aceitar/recusar; recusa mantem bloqueio.
 *  - satisfied: renderiza `children` (sem doc, sem exigencia ou ja aceito).
 */

interface LegalDocument {
  type: string;
  locale: string;
  version: string;
  hash: string;
  content: string;
  title: string;
  required_since: string;
  requires_acceptance: boolean;
}

interface AcceptanceStatusResponse {
  satisfied: boolean;
  accepted: boolean;
  document: LegalDocument | null;
}

type GateState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'satisfied' }
  | { phase: 'blocked'; document: LegalDocument };

const TERMS_STATUS_URL = '/api/v1/legal/terms/acceptance';

export function TermsAcceptanceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>({ phase: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  const loadStatus = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const res = await fetch(TERMS_STATUS_URL, { cache: 'no-store' });
      if (!res.ok) {
        setState({ phase: 'error' });
        return;
      }
      const json = await res.json();
      const data = json.data as AcceptanceStatusResponse | null;

      // Empty / ja aceito / sem exigencia -> libera children.
      if (!data || data.satisfied || !data.document || !data.document.requires_acceptance) {
        setState({ phase: 'satisfied' });
        return;
      }

      setState({ phase: 'blocked', document: data.document });
    } catch {
      setState({ phase: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleAccept = useCallback(async () => {
    if (state.phase !== 'blocked') return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/legal/${state.document.type.toLowerCase()}/acceptance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: state.document.version }),
      });

      if (!res.ok) {
        // Mantem o Gate aberto e permite retry (Zero Silencio).
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? 'Nao foi possivel registrar o aceite. Tente novamente.');
        return;
      }

      // Sucesso: revalida sessao/dados e libera o acesso com feedback explicito.
      setState({ phase: 'satisfied' });
      toast.success('Termos aceitos. Bom uso!');
      router.refresh();
    } catch {
      toast.error('Erro de conexao ao registrar o aceite. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [state, router]);

  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6" role="status" aria-busy="true">
        <div className="w-full max-w-lg space-y-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-10 w-32" />
          <span className="sr-only">Carregando os termos exigidos...</span>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <ErrorState
          title="Nao foi possivel carregar os termos"
          message="O acesso depende da leitura e do aceite dos termos. Tente novamente."
          onRetry={() => void loadStatus()}
        />
      </div>
    );
  }

  if (state.phase === 'blocked') {
    const { document } = state;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
      >
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-card shadow-lg">
          <div className="border-b p-6">
            <h2 id="terms-gate-title" className="text-lg font-semibold text-foreground">
              {document.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Versao {document.version} - vigente desde{' '}
              {new Date(document.required_since).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto whitespace-pre-wrap p-6 text-sm text-foreground">
            {document.content}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t p-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() =>
                toast.info('O acesso ao dashboard depende do aceite dos termos vigentes.')
              }
            >
              Recusar
            </Button>
            <Button onClick={() => void handleAccept()} disabled={submitting}>
              {submitting ? 'Registrando...' : 'Li e aceito os termos'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
