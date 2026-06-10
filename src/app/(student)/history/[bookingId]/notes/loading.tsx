import { PageWrapper } from '@/components/shared';
import { ReadOnlyNotesViewer } from '@/components/session/ReadOnlyNotesViewer';

/**
 * Estado loading da rota read-only do caderno pos-aula.
 * Renderiza o skeleton do proprio viewer enquanto a sessao + documento resolvem
 * (Zero Estados Indefinidos / acceptance "Estado loading").
 */
export default function Loading() {
  return (
    <PageWrapper className="max-w-3xl">
      <div className="mb-6 h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="mb-6">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <ReadOnlyNotesViewer state="loading" />
    </PageWrapper>
  );
}
