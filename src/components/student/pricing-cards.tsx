'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { useUserCurrency } from '@/lib/hooks/use-user-currency';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/currency';
import { resolvePrice } from '@/lib/pricing/config';

type Pkg = {
  id: 'SINGLE' | 'PACK_5' | 'PACK_10' | 'MONTHLY';
  credits: number;
  nameKey: string;
  descKey: string;
  priceLabelKey: 'perLesson' | 'perMonth';
  featureKeys: readonly string[];
  popular: boolean;
  badgeKey: string | null;
};

const PACKAGES: readonly Pkg[] = [
  {
    id: 'SINGLE',
    credits: 1,
    nameKey: 'singleTitle',
    descKey: 'singleDesc',
    priceLabelKey: 'perLesson',
    featureKeys: ['singleFeat1', 'singleFeat2', 'singleFeat3'],
    popular: false,
    badgeKey: null,
  },
  {
    id: 'PACK_5',
    credits: 5,
    nameKey: 'pack5Title',
    descKey: 'pack5Desc',
    priceLabelKey: 'perLesson',
    featureKeys: ['pack5Feat1', 'pack5Feat2', 'pack5Feat3'],
    popular: false,
    badgeKey: 'pack5Badge',
  },
  {
    id: 'PACK_10',
    credits: 10,
    nameKey: 'pack10Title',
    descKey: 'pack10Desc',
    priceLabelKey: 'perLesson',
    featureKeys: ['pack10Feat1', 'pack10Feat2', 'pack10Feat3', 'pack10Feat4'],
    popular: true,
    badgeKey: 'pack10Badge',
  },
  {
    id: 'MONTHLY',
    credits: 8,
    nameKey: 'monthlyTitle',
    descKey: 'monthlyDesc',
    priceLabelKey: 'perMonth',
    featureKeys: ['monthlyFeat1', 'monthlyFeat2', 'monthlyFeat3', 'monthlyFeat4'],
    popular: false,
    badgeKey: null,
  },
] as const;

// Assinatura (MONTHLY) e calculada server-side; usar 2x/sem como referencia de display.
const MONTHLY_REFERENCE_USD_CENTS = Math.ceil(2 * 16 * 4.33 * 100);
const FX: Record<Currency, number> = { USD: 1, USDC: 1, EUR: 0.92, BRL: 5.0 };

function priceCentsFor(id: Pkg['id'], currency: Currency): number {
  if (id === 'MONTHLY') return Math.ceil(MONTHLY_REFERENCE_USD_CENTS * FX[currency]);
  return resolvePrice(id, currency).amountCents;
}

export function PricingCards() {
  const t = useTranslations('credits.pricing');
  const locale = useLocale();
  const { currency, setCurrency } = useUserCurrency();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = async (packageId: string) => {
    setLoadingId(packageId);
    try {
      const isSubscription = packageId === 'MONTHLY';
      const body = isSubscription
        ? { isSubscription: true, weeklyFrequency: 2, currency }
        : { packageType: packageId, isSubscription: false, currency };

      const json = await apiClient.post<{ data: { url: string } }>(API.CHECKOUT, body);
      window.location.href = json.data.url;
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Checkout error',
      );
      setLoadingId(null);
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <label className="text-sm text-muted-foreground mr-2 self-center" htmlFor="currency-select">
          {t.has('currencyLabel') ? t('currencyLabel') : 'Currency'}
        </label>
        <select
          id="currency-select"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="bg-card border border-border rounded-md px-3 py-1 text-sm text-foreground"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PACKAGES.map((pkg) => (
        <div
          key={pkg.id}
          className={cn(
            'bg-card border rounded-2xl p-6 flex flex-col relative',
            pkg.popular
              ? 'border-2 border-primary shadow-lg shadow-primary/10'
              : 'border-border shadow-sm',
          )}
        >
          {pkg.popular && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              {t(pkg.badgeKey!)}
            </Badge>
          )}

          <div className="mb-4">
            <p className="text-sm text-muted-foreground">{t(pkg.descKey)}</p>
            <h3 className="text-lg font-bold text-foreground">{t(pkg.nameKey)}</h3>
          </div>

          <div className="mb-4">
            <div className="flex items-baseline gap-1">
              <PriceDisplay
                amountCents={priceCentsFor(pkg.id, currency)}
                currency={currency}
                locale={locale}
                className="text-3xl font-bold text-foreground"
              />
            </div>
            <p className="text-sm text-muted-foreground">{t(pkg.priceLabelKey)}</p>
          </div>

          <ul className="space-y-2 mb-6 flex-1">
            {pkg.featureKeys.map((fKey) => (
              <li key={fKey} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                {t.has(fKey) ? t(fKey) : fKey}
              </li>
            ))}
          </ul>

          <Button
            onClick={() => handleBuy(pkg.id)}
            disabled={loadingId !== null}
            variant={pkg.popular ? 'default' : 'outline'}
            className={cn('w-full min-h-[48px]', !pkg.popular && 'border-primary text-primary hover:bg-primary/5')}
          >
            {loadingId === pkg.id ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{pkg.id === 'MONTHLY' ? t('subscribing') : t('buying')}</>
            ) : (
              t('buyBtn')
            )}
          </Button>
        </div>
      ))}
      </div>
    </>
  );
}
