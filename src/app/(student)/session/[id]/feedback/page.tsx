import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';
import { FeedbackForm } from '@/components/session/feedback-form';

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
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-lg mx-auto">
      <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
        <Link href={ROUTES.DASHBOARD} className="hover:text-foreground transition-colors">
          ← Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground">Avaliar aula</span>
      </nav>
      <FeedbackForm sessionId={id} />
    </div>
  );
}
