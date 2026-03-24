import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { BillingTabs } from './billing-tabs';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits.billing');
  return { title: t('title') };
}

export default async function BillingPage() {
  const t = await getTranslations('credits.billing');

  return (
    <PageWrapper className="max-w-3xl">
      <Link
        href={ROUTES.ACCOUNT}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('title')}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <BillingTabs />
    </PageWrapper>
  );
}
