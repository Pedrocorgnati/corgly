'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PaymentHistory } from '@/components/billing/payment-history';
import { SubscriptionManager } from '@/components/billing/subscription-manager';
import { CreditBreakdown } from '@/components/billing/credit-breakdown';

export function BillingTabs() {
  const t = useTranslations('credits.billing.tabs');

  return (
    <Tabs data-testid="billing-tabs" defaultValue="history">
      <TabsList className="w-full sm:w-auto overflow-x-auto min-h-[44px]">
        <TabsTrigger data-testid="billing-tab-history-button" value="history" className="min-h-[40px] min-w-[44px]">
          {t('history')}
        </TabsTrigger>
        <TabsTrigger data-testid="billing-tab-subscription-button" value="subscription" className="min-h-[40px] min-w-[44px]">
          {t('subscription')}
        </TabsTrigger>
        <TabsTrigger data-testid="billing-tab-credits-button" value="credits" className="min-h-[40px] min-w-[44px]">
          {t('credits')}
        </TabsTrigger>
      </TabsList>

      <TabsContent data-testid="billing-tab-history-content" value="history" className="mt-4">
        <PaymentHistory />
      </TabsContent>

      <TabsContent data-testid="billing-tab-subscription-content" value="subscription" className="mt-4">
        <SubscriptionManager />
      </TabsContent>

      <TabsContent data-testid="billing-tab-credits-content" value="credits" className="mt-4">
        <CreditBreakdown />
      </TabsContent>
    </Tabs>
  );
}
