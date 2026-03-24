'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PRICING } from '@/lib/constants';
import { apiClient, ApiError } from '@/lib/api-client';

const PACKAGES = [
  {
    id: 'SINGLE',
    credits: 1,
    nameKey: 'singleTitle' as const,
    descKey: 'singleDesc' as const,
    price: PRICING.SINGLE,
    priceLabelKey: 'perLesson' as const,
    featureKeys: ['singleFeat1', 'singleFeat2', 'singleFeat3'] as const,
    popular: false,
    badgeKey: null,
  },
  {
    id: 'PACK_5',
    credits: 5,
    nameKey: 'pack5Title' as const,
    descKey: 'pack5Desc' as const,
    price: PRICING.PACK_5,
    priceLabelKey: 'perLesson' as const,
    featureKeys: ['pack5Feat1', 'pack5Feat2', 'pack5Feat3'] as const,
    popular: false,
    badgeKey: 'pack5Badge' as const,
  },
  {
    id: 'PACK_10',
    credits: 10,
    nameKey: 'pack10Title' as const,
    descKey: 'pack10Desc' as const,
    price: PRICING.PACK_10,
    priceLabelKey: 'perLesson' as const,
    featureKeys: ['pack10Feat1', 'pack10Feat2', 'pack10Feat3', 'pack10Feat4'] as const,
    popular: true,
    badgeKey: 'pack10Badge' as const,
  },
  {
    id: 'MONTHLY',
    credits: 8,
    nameKey: 'monthlyTitle' as const,
    descKey: 'monthlyDesc' as const,
    price: PRICING.MONTHLY,
    priceLabelKey: 'perMonth' as const,
    featureKeys: ['monthlyFeat1', 'monthlyFeat2', 'monthlyFeat3', 'monthlyFeat4'] as const,
    popular: false,
    badgeKey: null,
  },
] as const;

export function PricingCards() {
  const t = useTranslations('credits.pricing');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = async (packageId: string) => {
    setLoadingId(packageId);
    try {
      const isSubscription = packageId === 'MONTHLY';
      const body = isSubscription
        ? { isSubscription: true, weeklyFrequency: 2 }
        : { packageType: packageId, isSubscription: false };

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
              <span className="text-3xl font-bold text-foreground">$ {pkg.price}</span>
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
  );
}
