'use client';

import Link from 'next/link';
import { CheckCircle2, Star, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

const PLANS = [
  {
    id: 'SINGLE',
    i18nKey: 'single',
    price: 25,
    pricePerLesson: 25,
    credits: 1,
    popular: false,
    highlight: false,
  },
  {
    id: 'PACK_5',
    i18nKey: 'pack5',
    price: 110,
    pricePerLesson: 22,
    credits: 5,
    popular: false,
    highlight: false,
  },
  {
    id: 'PACK_10',
    i18nKey: 'pack10',
    price: 190,
    pricePerLesson: 19,
    credits: 10,
    popular: true,
    highlight: true,
  },
  {
    id: 'MONTHLY',
    i18nKey: 'monthly',
    price: 139, // Math.ceil(2 × $16/aula × 4.33 sem/mês) — 2×/semana
    pricePerLesson: 17, // ~$139 / 8 aulas
    credits: 8,
    popular: false,
    highlight: false,
  },
] as const;

interface PricingSectionProps {
  isFirstPurchase?: boolean;
  isAuthenticated?: boolean;
}

export function PricingSection({
  isFirstPurchase,
  isAuthenticated,
}: PricingSectionProps) {
  const t = useTranslations('landing');
  const showDiscount = isFirstPurchase !== false;
  const ctaHref = isAuthenticated ? ROUTES.CREDITS : ROUTES.REGISTER;

  return (
    <section className="py-20 bg-background" id="precos" aria-labelledby="pricing-heading">
      {/* Discount Banner */}
      {showDiscount && (
        <div className="bg-warning/10 dark:bg-warning/10 border-y border-warning/30 py-3 mb-12">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6 flex items-center justify-center gap-2 flex-wrap">
            <AlertCircle className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">
              {t('pricing.discount_banner')}
            </span>
          </div>
        </div>
      )}

      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">
            {t('pricing.badge')}
          </Badge>
          <h2 id="pricing-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('pricing.title')}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const features = t.raw(`pricing.packages.${plan.i18nKey}.features`) as string[];

            return (
              <Card
                key={plan.id}
                className={`relative border flex flex-col ${
                  plan.highlight
                    ? 'border-2 border-primary shadow-lg'
                    : 'border-border'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      {t('pricing.most_popular')}
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4 pt-8">
                  <h3 className="text-lg font-bold text-foreground">
                    {t(`pricing.packages.${plan.i18nKey}.name`)}
                  </h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">
                      / {plan.credits} {plan.credits > 1 ? t('pricing.lessons_suffix') : t('pricing.lesson_suffix')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${plan.pricePerLesson}{t('pricing.per_lesson_suffix')}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-6">
                  <ul className="space-y-2 flex-1">
                    {features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={ctaHref}>
                    <Button
                      className={`w-full ${plan.highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                      variant={plan.highlight ? 'default' : 'outline'}
                    >
                      {t(`pricing.packages.${plan.i18nKey}.cta`)}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
