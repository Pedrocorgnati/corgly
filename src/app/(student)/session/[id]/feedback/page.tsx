import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { FeedbackForm } from '@/components/session/feedback-form';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.sessionFeedback');
  return { title: t('metaTitle'), robots: 'noindex' };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FeedbackPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  const t = await getTranslations('pages.sessionFeedback');
  const tNav = await getTranslations('nav');
  const tA11y = await getTranslations('a11y');

  return (
    <PageWrapper data-testid="page-session-feedback" className="max-w-lg">
      <nav data-testid="session-feedback-breadcrumb" aria-label={tA11y('breadcrumb')} className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
        <Link data-testid="session-feedback-breadcrumb-dashboard-link" href={ROUTES.DASHBOARD} className="hover:text-foreground transition-colors">
          &larr; {tNav('dashboard')}
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">{t('current')}</span>
      </nav>
      <FeedbackForm sessionId={id} />
    </PageWrapper>
  );
}
