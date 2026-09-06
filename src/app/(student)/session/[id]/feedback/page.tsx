import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';
import { FeedbackForm } from '@/components/session/feedback-form';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Avaliar Aula',
  robots: 'noindex',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FeedbackPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  return (
    <PageWrapper data-testid="page-session-feedback" className="max-w-lg">
      <nav data-testid="session-feedback-breadcrumb" aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
        <Link data-testid="session-feedback-breadcrumb-dashboard-link" href={ROUTES.DASHBOARD} className="hover:text-foreground transition-colors">
          ← Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">Avaliar aula</span>
      </nav>
      <FeedbackForm sessionId={id} />
    </PageWrapper>
  );
}
