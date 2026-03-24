import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PricingCards } from '@/components/student/pricing-cards';
import { DiscountBanner } from '@/components/student/discount-banner';
import { PaymentCanceledBanner } from '@/components/student/payment-canceled-banner';
import { getSession } from '@/lib/auth/session';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits.page');
  return { title: t('title') };
}

interface CreditsPageProps {
  searchParams: Promise<{ canceled?: string }>;
}

export default async function CreditsPage({ searchParams }: CreditsPageProps) {
  const params = await searchParams;
  const showCancelBanner = params.canceled === 'true';

  const [session, t] = await Promise.all([
    getSession(),
    getTranslations('credits.page'),
  ]);
  const isFirstPurchase = session?.user?.isFirstPurchase ?? false;

  return (
    <PageWrapper className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <PaymentCanceledBanner visible={showCancelBanner} />

      <DiscountBanner visible={isFirstPurchase} />

      <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-2xl" />}>
        <PricingCards />
      </Suspense>
    </PageWrapper>
  );
}
