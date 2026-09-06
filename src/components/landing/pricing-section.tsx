'use client';

import { useState } from 'react';
import { Calendar, Clock, Layers, RefreshCw, Star, Ticket, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/button-link';
import {
  FIRST_LESSON_USD,
  SINGLE_USD,
  PACK10_USD,
  PACK10_PER,
  MONTHLY_OPTIONS,
  type MonthlyLessons,
  monthlyTotalUsd,
  monthlyPerUsd,
  formatUsd,
  planHref,
} from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const FEATURE_ICONS = {
  SINGLE: [Calendar, Clock],
  PACK_10: [Layers, Calendar],
  MONTHLY: [TrendingUp, RefreshCw],
} as const;

export function PricingSection() {
  const t = useTranslations('landing.pricing');
  const locale = useLocale();
  const { isAuthenticated } = useAuth();
  const [monthlyLessons, setMonthlyLessons] = useState<MonthlyLessons>(MONTHLY_OPTIONS[0].lessons);
  const monthlyTotal = monthlyTotalUsd(monthlyLessons);
  const monthlyPer = monthlyPerUsd(monthlyLessons);

  return (
    <section data-testid="landing-pricing" className="py-[4.5rem] md:py-20 bg-white" id="precos" aria-labelledby="pricing-heading">
      <div className="max-w-[1120px] mx-auto px-5 md:px-6">
        <div className="bg-pricing-banner rounded-[10px] py-2.5 px-5 mb-10 text-white">
          <p className="flex items-center justify-center gap-2 text-[13px] md:text-[15px] font-semibold text-center">
            <Ticket className="h-4 w-4 flex-shrink-0" />
            {t('discount_banner')}
          </p>
        </div>

        <h2 id="pricing-heading" className="text-[2rem] md:text-[2.6rem] font-bold text-[#1B2140] tracking-tight mb-9">
          {t('title')}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <article
            data-testid="landing-pricing-plan-single"
            className="rounded-[10px] border border-slate-200 bg-white px-7 py-7 flex flex-col"
          >
            <h3 className="text-[1.2rem] font-bold text-[#1B2140]">{t('packages.single.name')}</h3>
            <span className="mt-1.5 block h-[3px] w-9 rounded-full bg-amber-500" />
            <p className="mt-6 text-[13px] text-slate-500">{t('first_lesson_label')}</p>
            <p className="mt-1 flex items-baseline gap-2.5">
              <span className="text-[2.15rem] font-bold tracking-tight text-[#1B2140]">{formatUsd(FIRST_LESSON_USD, locale)}</span>
              <span className="text-[1.05rem] text-slate-400 line-through">{formatUsd(SINGLE_USD, locale)}</span>
            </p>
            <p className="mt-5 text-[13px] text-slate-500">{t('following_lessons_label')}</p>
            <p className="text-[2.15rem] font-bold tracking-tight text-[#1B2140] leading-none">{formatUsd(SINGLE_USD, locale)}</p>
            <p className="mt-1 text-[13px] text-slate-500">{t('per_lesson')}</p>
            <ButtonLink
              href={planHref(isAuthenticated, 'SINGLE')}
              data-testid="landing-pricing-plan-single-cta-button"
              variant="outline"
              className="mt-7 w-full h-11 min-h-[44px] rounded-[10px] border-[1.5px] border-[#7c5cbf] text-[#7c5cbf] hover:bg-[#7c5cbf]/5 font-semibold"
            >
              {t('packages.single.cta')}
            </ButtonLink>
            <ul className="mt-5 space-y-2.5">
              {(t.raw('packages.single.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.SINGLE[i] ?? Calendar;
                return (
                  <li key={feat} className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                    <Icon className="h-4 w-4 text-[#7c5cbf]" />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>

          <article
            data-testid="landing-pricing-plan-pack-10"
            className="relative rounded-[10px] border-2 border-[#7c5cbf] bg-white px-7 py-7 flex flex-col shadow-[0_12px_32px_rgba(124,92,191,0.12)]"
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
              <span className="bg-[#7c5cbf] text-white px-3.5 py-1 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" />
                {t('most_chosen')}
              </span>
            </div>
            <h3 className="text-[1.2rem] font-bold text-[#1B2140]">{t('packages.pack10.name')}</h3>
            <span className="mt-1.5 block h-[3px] w-9 rounded-full bg-[#7c5cbf]" />
            <p className="mt-6 text-[2.75rem] font-bold tracking-tight text-[#1B2140] leading-none">{formatUsd(PACK10_USD, locale)}</p>
            <p className="mt-3 text-[13px] text-slate-500">{t('equivalent_to')}</p>
            <p className="mt-1 text-[2.15rem] font-bold tracking-tight text-[#7c5cbf] leading-none">
              {formatUsd(PACK10_PER, locale)}
              <span className="text-[1rem] font-medium text-[#7c5cbf]/80">{t('per_lesson_suffix')}</span>
            </p>
            <ButtonLink
              href={planHref(isAuthenticated, 'PACK_10')}
              data-testid="landing-pricing-plan-pack-10-cta-button"
              className="mt-7 w-full h-11 min-h-[44px] rounded-[10px] bg-[#7c5cbf] hover:bg-[#6d4fb0] font-semibold text-white"
            >
              {t('packages.pack10.cta')}
            </ButtonLink>
            <ul className="mt-5 space-y-2.5">
              {(t.raw('packages.pack10.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.PACK_10[i] ?? Layers;
                return (
                  <li key={feat} className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                    <Icon className="h-4 w-4 text-[#7c5cbf]" />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>

          <article
            data-testid="landing-pricing-plan-monthly"
            className="rounded-[10px] border border-slate-200 bg-white px-7 py-7 flex flex-col"
          >
            <h3 className="text-[1.2rem] font-bold text-[#1B2140]">{t('packages.monthly.name')}</h3>
            <span className="mt-1.5 block h-[3px] w-9 rounded-full bg-amber-500" />
            <div
              data-testid="landing-pricing-monthly-options"
              className="mt-5 grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label={t('packages.monthly.name')}
            >
              {MONTHLY_OPTIONS.map((option) => {
                const selected = monthlyLessons === option.lessons;
                return (
                  <button
                    key={option.lessons}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`landing-pricing-monthly-option-${option.lessons}`}
                    onClick={() => setMonthlyLessons(option.lessons)}
                    className={cn(
                      'rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-[#7c5cbf] bg-[#7c5cbf]/10'
                        : 'border-slate-200 bg-white hover:border-[#c4b0e8]',
                    )}
                  >
                    <p className="text-[13px] font-semibold text-[#1B2140]">
                      {option.lessons} {t('lessons_suffix')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {formatUsd(option.per, locale)}
                      {t('per_lesson_suffix')}
                    </p>
                    {option.lessons === 20 && (
                      <p className="mt-0.5 text-[11px] font-medium text-[#d97706]">{t('best_cost')}</p>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-[2.75rem] font-bold tracking-tight text-[#1B2140] leading-none">
              {formatUsd(monthlyTotal, locale)}
            </p>
            <p className="mt-2 text-[13px] text-slate-500">{t('per_month', { count: monthlyLessons })}</p>
            <p className="mt-3 text-[2.15rem] font-bold tracking-tight text-[#d97706] leading-none">
              {formatUsd(monthlyPer, locale)}
              <span className="text-[1rem] font-medium">{t('per_lesson_suffix')}</span>
            </p>
            {monthlyLessons === 20 && (
              <p className="mt-1 text-[13px] font-medium text-[#d97706]">{t('best_cost')}</p>
            )}
            <ButtonLink
              href={planHref(isAuthenticated, 'MONTHLY', monthlyLessons)}
              data-testid="landing-pricing-plan-monthly-cta-button"
              variant="outline"
              className="mt-7 w-full h-11 min-h-[44px] rounded-[10px] border-[1.5px] border-[#7c5cbf] text-[#7c5cbf] hover:bg-[#7c5cbf]/5 font-semibold"
            >
              {t('packages.monthly.cta')}
            </ButtonLink>
            <ul className="mt-5 space-y-2.5">
              {(t.raw('packages.monthly.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.MONTHLY[i] ?? TrendingUp;
                return (
                  <li key={feat} className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                    <Icon className="h-4 w-4 text-[#7c5cbf]" />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>
        </div>
        <div className="mt-10 flex items-center gap-4">
          <span className="hidden sm:block h-px flex-1 bg-slate-200" />
          <p data-testid="landing-pricing-footnote" className="text-center text-[13px] text-slate-500">
            {t('footnote_credits')}
            <span className="mx-1.5 text-amber-500">•</span>
            {t('footnote_cancel')}
          </p>
          <span className="hidden sm:block h-px flex-1 bg-slate-200" />
        </div>
      </div>
    </section>
  );
}
