import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { sessionNotesService } from '@/lib/sessions/session-notes.service';
import {
  ReadOnlyNotesViewer,
  type ReadOnlyNotesViewerProps,
} from '@/components/session/ReadOnlyNotesViewer';
import { PageWrapper } from '@/components/shared';
import { ROUTES } from '@/lib/constants/routes';
import { logger } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'Caderno da Aula',
  robots: 'noindex',
};

interface Props {
  params: Promise<{ bookingId: string }>;
}

/**
 * Rota read-only do caderno pos-aula (ST-12, PRD §12.5).
 *
 * `bookingId` resolve para `Session.id`. A autorizacao (RBAC tri-condicao,
 * colapsada para owner|admin nesta plataforma single-tutor) e delegada
 * integralmente ao `sessionNotesService` — nenhum papel e inferido do client.
 * Todos os estados (loading via loading.tsx, ok, empty, error 403/404/500) sao
 * mapeados explicitamente para o `ReadOnlyNotesViewer`.
 */
export default async function NotesPage({ params }: Props) {
  const { bookingId } = await params;

  let viewer: ReadOnlyNotesViewerProps;

  if (!bookingId) {
    viewer = { state: 'error', errorKind: 'not_found' };
  } else {
    const session = await getSession();

    if (!session) {
      // O layout (student) ja redireciona nao-autenticado para login;
      // defesa em profundidade caso este componente seja alcancado sem sessao.
      viewer = { state: 'error', errorKind: 'forbidden' };
    } else {
      try {
        const result = await sessionNotesService.getReadOnlyNotes(bookingId, session.user.id);

        switch (result.status) {
          case 'ok':
            viewer = { state: 'ok', plainText: result.plainText, updatedAt: result.updatedAt };
            break;
          case 'empty':
            viewer = { state: 'empty' };
            break;
          case 'not_found':
            viewer = { state: 'error', errorKind: 'not_found' };
            break;
          case 'forbidden':
            viewer = { state: 'error', errorKind: 'forbidden' };
            break;
        }
      } catch (error) {
        logger.error(
          'Falha ao carregar caderno read-only pos-aula',
          { bookingId, userId: session.user.id },
          error as Error,
        );
        viewer = { state: 'error', errorKind: 'server' };
      }
    }
  }

  return (
    <PageWrapper data-testid="page-history-notes-detail" className="max-w-3xl">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href={ROUTES.HISTORY} className="transition-colors hover:text-foreground">
          ← Histórico de aulas
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">
          Caderno da aula
        </span>
      </nav>

      <header data-testid="history-notes-detail-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Caderno da aula</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Anotacoes registradas durante a sessao, em modo somente leitura.
        </p>
      </header>

      <ReadOnlyNotesViewer data-testid="history-notes-detail-content" {...viewer} />
    </PageWrapper>
  );
}
