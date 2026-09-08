import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CreditCard } from 'lucide-react';
import { ProfileForm } from '@/components/auth/profile-form';
import { LgpdSection } from '@/components/auth/lgpd-section';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.account');
  return { title: t('metaTitle') };
}

export default async function AccountPage() {
  const t = await getTranslations('pages.account');

  return (
    <PageWrapper data-testid="page-account" className="max-w-2xl">
      <div data-testid="account-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <div data-testid="account-profile-form-section">
        <ProfileForm />
      </div>

      {/* LGPD section */}
      <div data-testid="account-lgpd-section" className="mt-6">
        <LgpdSection />
      </div>

      {/* Quick link to billing */}
      <div data-testid="account-billing-link-section" className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t('paymentsTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('paymentsSubtitle')}</p>
          </div>
          <Link href={ROUTES.ACCOUNT_BILLING}>
            <Button data-testid="account-view-billing-button" variant="outline" size="sm" className="gap-2">
              <CreditCard className="h-4 w-4" />
              {t('viewPayments')}
            </Button>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
