import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Receipt } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { BillingHistoryClient } from './billing-history-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.billingHistory');
  return { title: t('metaTitle') };
}

export default async function BillingHistoryPage() {
  const t = await getTranslations('pages.billingHistory');

  return (
    <PageWrapper data-testid="page-billing-history" className="max-w-5xl">
      <div data-testid="billing-history-header" className="mb-6 flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      <BillingHistoryClient />
    </PageWrapper>
  );
}
