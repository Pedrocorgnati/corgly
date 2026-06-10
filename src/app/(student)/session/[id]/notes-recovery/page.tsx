import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';
import { NotesRecoveryPanel } from '@/components/session/notes-recovery-panel';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Recuperar caderno',
  robots: 'noindex',
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Pagina ST-49: recuperacao e exportacao do caderno pos-aula (T-020, §12.3).
 *
 * Server component fino que resolve o `id` da sessao e delega a interacao ao
 * client `NotesRecoveryPanel`. RBAC efetivo e aplicado nos endpoints
 * `/notes/snapshots`, `/notes/recover` e `/notes/export` consumidos pelo painel.
 */
export default async function NotesRecoveryPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  return (
    <PageWrapper className="max-w-lg">
      <nav
        aria-label="Breadcrumb"
        className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5"
      >
        <Link href={ROUTES.SESSION(id)} className="hover:text-foreground transition-colors">
          ← Voltar para a aula
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">
          Recuperar caderno
        </span>
      </nav>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Recuperar caderno</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exporte o caderno desta aula ou restaure uma versão salva anteriormente.
        </p>
      </header>
      <NotesRecoveryPanel sessionId={id} />
    </PageWrapper>
  );
}
