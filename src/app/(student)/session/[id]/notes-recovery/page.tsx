import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { NotesRecoveryPanel } from '@/components/session/notes-recovery-panel';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.notesRecovery');
  return { title: t('metaTitle'), robots: 'noindex' };
}

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

  const t = await getTranslations('pages.notesRecovery');
  const tA11y = await getTranslations('a11y');

  return (
    <PageWrapper data-testid="page-session-notes-recovery" className="max-w-lg">
      <nav
        data-testid="session-notes-recovery-breadcrumb"
        aria-label={tA11y('breadcrumb')}
        className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5"
      >
        <Link
          data-testid="session-notes-recovery-breadcrumb-session-link"
          href={ROUTES.SESSION(id)}
          className="hover:text-foreground transition-colors"
        >
          &larr; {t('backSession')}
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">
          {t('current')}
        </span>
      </nav>
      <header data-testid="session-notes-recovery-header" className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <NotesRecoveryPanel sessionId={id} />
    </PageWrapper>
  );
}
