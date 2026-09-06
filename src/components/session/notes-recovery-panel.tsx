'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { History, Download, RotateCcw } from 'lucide-react';

import { API, ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';

/** Item de snapshot retornado por GET /notes/snapshots. */
interface SnapshotListItem {
  id: string;
  version: number;
  createdById: string;
  createdAt: string;
  metadata: {
    plainTextLength?: number;
    yjsByteLength?: number;
    documentUpdatedAt?: string | null;
  } | null;
}

interface SnapshotsResponse {
  data: { snapshots: SnapshotListItem[] } | null;
  error: string | null;
  message: string | null;
}

interface RecoverResponse {
  data: { restoredVersion: number; documentUpdatedAt: string } | null;
  error: string | null;
  message: string | null;
}

type LoadState = 'loading' | 'error' | 'ready';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface NotesRecoveryPanelProps {
  sessionId: string;
}

/**
 * Painel ST-49: recuperacao e exportacao do caderno (T-020, PRD §12.3).
 *
 * Lista os snapshots versionados, permite escolher um para restaurar (com
 * confirmacao destrutiva explicita) e exportar o caderno em HTML ou Markdown.
 * Trata todos os estados: loading, empty, error e success (Regras Zero).
 */
export function NotesRecoveryPanel({ sessionId }: NotesRecoveryPanelProps) {
  const router = useRouter();

  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selected, setSelected] = useState<SnapshotListItem | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const loadSnapshots = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const res = await apiClient.get<SnapshotsResponse>(
        API.SESSION_NOTES_SNAPSHOTS(sessionId),
      );
      setSnapshots(res.data?.snapshots ?? []);
      setLoadState('ready');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os snapshots.';
      setErrorMessage(message);
      setLoadState('error');
    }
  }, [sessionId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleConfirmRecover = useCallback(async () => {
    if (!selected) return;
    setIsRecovering(true);
    try {
      const res = await apiClient.post<RecoverResponse>(
        API.SESSION_NOTES_RECOVER(sessionId),
        { snapshotId: selected.id },
      );
      toast.success(
        res.message ?? `Caderno restaurado para a versão ${selected.version}.`,
      );
      setSelected(null);
      router.push(ROUTES.SESSION(sessionId));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Não foi possível restaurar o snapshot.';
      toast.error(message);
    } finally {
      setIsRecovering(false);
    }
  }, [selected, sessionId, router]);

  const exportHref = (format: 'markdown' | 'html'): string =>
    `${API.SESSION_NOTES_EXPORT(sessionId)}?format=${format}`;

  if (loadState === 'loading') {
    return (
      <div data-testid="session-notes-recovery-loading" className="space-y-3" aria-busy="true" aria-label="Carregando snapshots">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <ErrorState
        data-testid="session-notes-recovery-error"
        title="Erro ao carregar snapshots"
        message={errorMessage ?? 'Ocorreu um erro. Tente novamente.'}
        onRetry={loadSnapshots}
      />
    );
  }

  return (
    <div data-testid="session-notes-recovery-panel" className="space-y-6">
      <section aria-labelledby="export-heading">
        <h2 id="export-heading" className="text-sm font-semibold text-foreground mb-2">
          Exportar caderno
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Baixe o conteúdo atual do caderno desta aula.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportHref('markdown')}
            download
            data-testid="session-notes-recovery-export-markdown-button"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Download className="size-4" />
            Markdown
          </a>
          <a
            href={exportHref('html')}
            download
            data-testid="session-notes-recovery-export-html-button"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Download className="size-4" />
            HTML
          </a>
        </div>
      </section>

      <section aria-labelledby="recovery-heading">
        <h2 id="recovery-heading" className="text-sm font-semibold text-foreground mb-2">
          Restaurar versão anterior
        </h2>

        {snapshots.length === 0 ? (
          <EmptyState
            data-testid="session-notes-recovery-empty"
            icon={History}
            title="Nenhum snapshot disponível"
            description="Ainda não há versões salvas deste caderno para restaurar."
          />
        ) : (
          <ul role="list" data-testid="session-notes-recovery-list" className="space-y-3">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <Card data-testid={`session-notes-recovery-snapshot-${snapshot.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Versão {snapshot.version}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {dateFormatter.format(new Date(snapshot.createdAt))}
                      </span>
                    </div>
                    {typeof snapshot.metadata?.plainTextLength === 'number' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {snapshot.metadata.plainTextLength} caracteres
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(snapshot)}
                    aria-label={`Restaurar versão ${snapshot.version}`}
                    data-testid={`session-notes-recovery-restore-${snapshot.id}`}
                    className="shrink-0"
                  >
                    <RotateCcw className="size-4" />
                    Restaurar
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        isOpen={selected !== null}
        onClose={() => !isRecovering && setSelected(null)}
        onConfirm={handleConfirmRecover}
        title="Restaurar caderno?"
        message={
          selected
            ? `Esta ação substitui o conteúdo atual do caderno pela versão ${selected.version} (${dateFormatter.format(
                new Date(selected.createdAt),
              )}). O conteúdo atual não salvo como snapshot será perdido. Deseja continuar?`
            : ''
        }
        confirmText="Restaurar versão"
        cancelText="Cancelar"
        dangerLevel="high"
        isLoading={isRecovering}
        confirmTestId="session-notes-recovery-confirm-button"
        cancelTestId="session-notes-recovery-cancel-button"
      />
    </div>
  );
}
