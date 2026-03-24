import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CreditAdjustForm } from '@/components/admin/credit-adjust-form';
import { CreditLog } from '@/components/admin/credit-log';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits.admin');
  return { title: `Admin: ${t('title')} — Corgly` };
}

export default async function AdminCreditsPage() {
  const t = await getTranslations('credits.admin');

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <div className="flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8">
        <Suspense fallback={<div className="animate-pulse h-80 bg-muted rounded-xl" />}>
          <CreditAdjustForm />
        </Suspense>

        <Suspense fallback={<div className="animate-pulse h-80 bg-muted rounded-xl" />}>
          <CreditLog />
        </Suspense>
      </div>
    </PageWrapper>
  );
}
