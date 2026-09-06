import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe');
  return { title: t('title'), robots: { index: false, follow: false } };
}

interface UnsubscribePageProps {
  searchParams: Promise<{ status?: string }>;
}

type Status = 'success' | 'invalid' | 'error' | 'unknown';

function parseStatus(raw: string | undefined): Status {
  if (raw === 'success' || raw === 'invalid' || raw === 'error') return raw;
  return 'unknown';
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const t = await getTranslations('unsubscribe');

  const title = t(`${status}.title`);
  const message = t(`${status}.message`);

  return (
    <div data-testid="page-unsubscribe" className="min-h-[60vh] flex items-center justify-center px-4">
      <div data-testid={`unsubscribe-${status}`} className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-3">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <Link
          href="/"
          data-testid="unsubscribe-back-link"
          className="inline-block text-sm text-primary hover:underline"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  );
}
