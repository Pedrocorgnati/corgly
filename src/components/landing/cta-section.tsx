'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/button-link';
import { firstLessonHref, formatUsd, FIRST_LESSON_USD } from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';

export function CTASection() {
  const t = useTranslations('landing.cta');
  const locale = useLocale();
  const { isAuthenticated } = useAuth();

  return (
    <section data-testid="landing-cta" className="py-11 md:py-12 bg-cta-lilac" aria-labelledby="cta-heading">
      <div className="max-w-[1120px] mx-auto px-5 md:px-6 text-center">
        <h2 id="cta-heading" className="text-[1.45rem] md:text-[1.85rem] font-semibold text-white tracking-tight">
          {t('title')}
        </h2>
        <p className="sr-only">{t('subtitle')}</p>
        <ButtonLink
          href={firstLessonHref(isAuthenticated)}
          data-testid="landing-cta-primary-button"
          size="lg"
          className="mt-5 w-full sm:w-auto h-11 min-h-[44px] rounded-[10px] bg-white text-[#5b4a9a] hover:bg-white/90 font-semibold text-[15px] shadow-sm px-8"
        >
          {t('button', { price: formatUsd(FIRST_LESSON_USD, locale) })}
        </ButtonLink>
      </div>
    </section>
  );
}
