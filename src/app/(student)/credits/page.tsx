import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  PricingCards,
  isShowcasePlanId,
  type ShowcasePlanId,
} from '@/components/student/pricing-cards';
import { DiscountBanner } from '@/components/student/discount-banner';
import { PaymentCanceledBanner } from '@/components/student/payment-canceled-banner';
import { getSession } from '@/lib/auth/session';
import { PageWrapper } from '@/components/shared';
import type { MonthlyLessons } from '@/lib/constants/landing';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits.page');
  return { title: t('title') };
}

interface CreditsPageProps {
  searchParams: Promise<{ canceled?: string; plan?: string; lessons?: string }>;
}

/**
 * `?plan=` vem da landing (`planHref` em `src/lib/constants/landing.ts`).
 * Plano desconhecido NAO quebra a pagina nem inventa selecao: cai em null e a
 * vitrine abre no estado padrao.
 */
function parsePlan(raw: string | undefined): ShowcasePlanId | null {
  const normalized = raw?.trim().toUpperCase();
  return isShowcasePlanId(normalized) ? normalized : null;
}

/** `?lessons=` so aceita os dois volumes publicados (10 e 20). */
function parseMonthlyLessons(raw: string | undefined): MonthlyLessons | null {
  const normalized = raw?.trim();
  if (normalized === '10') return 10;
  if (normalized === '20') return 20;
  return null;
}

export default async function CreditsPage({ searchParams }: CreditsPageProps) {
  const params = await searchParams;
  const showCancelBanner = params.canceled === 'true';
  const initialPlan = parsePlan(params.plan);
  const initialMonthlyLessons = parseMonthlyLessons(params.lessons);

  const [session, t] = await Promise.all([
    getSession(),
    getTranslations('credits.page'),
  ]);
  const isFirstPurchase = session?.user?.isFirstPurchase ?? false;

  return (
    <PageWrapper data-testid="page-credits" className="max-w-6xl">
      <div data-testid="credits-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <PaymentCanceledBanner visible={showCancelBanner} />

      <DiscountBanner visible={isFirstPurchase} />

      <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-2xl" />}>
        <PricingCards
          isFirstPurchase={isFirstPurchase}
          initialPlan={initialPlan}
          initialMonthlyLessons={initialMonthlyLessons}
        />
      </Suspense>
    </PageWrapper>
  );
}
