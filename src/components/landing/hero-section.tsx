'use client';

import Image from 'next/image';
import { Globe, Clock, MessageCircle, Calendar } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { ButtonLink } from '@/components/ui/button-link';
import { firstLessonHref, formatUsd, FIRST_LESSON_USD, LESSON_DURATION_MINUTES } from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const t = useTranslations('landing.hero');
  const locale = useLocale();
  const { isAuthenticated } = useAuth();
  const ctaHref = firstLessonHref(isAuthenticated);

  return (
    <section
      data-testid="landing-hero"
      className="relative -mt-[52px] flex items-center bg-hero-lilac overflow-hidden max-h-[200vh] pt-[52px]"
      aria-labelledby="hero-heading"
    >
      <div className="relative max-w-[1120px] mx-auto px-5 md:px-6 w-full py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
          <div className="space-y-5">
            <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-white tracking-[0.01em]">
              <Image src="/flags/br.svg" alt="" width={22} height={16} className="h-4 w-[22px] rounded-[10px] object-cover shadow-sm" />
              <span>{t('eyebrow')}</span>
            </p>
            <h1
              id="hero-heading"
              className="text-[2.35rem] sm:text-[2.85rem] lg:text-[3.35rem] font-bold text-white leading-[1.12] tracking-tight max-w-[16ch]"
            >
              {t('title')}
            </h1>
            <p className="text-[1.05rem] md:text-[1.2rem] text-white max-w-[32rem] leading-[1.55] font-medium">
              {t('subtitle')}
            </p>
            <ul className="flex flex-wrap gap-2.5">
              <li
                data-testid="landing-hero-proof-countries"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/55 bg-white/20 px-3.5 py-[7px] text-[13px] font-medium text-white"
              >
                <Globe className="h-3.5 w-3.5" />
                {t('proof_countries')}
              </li>
              <li
                data-testid="landing-hero-proof-duration"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/55 bg-white/20 px-3.5 py-[7px] text-[13px] font-medium text-white"
              >
                <Clock className="h-3.5 w-3.5" />
                {t('proof_duration')}
              </li>
              <li
                data-testid="landing-hero-proof-feedback"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/55 bg-white/20 px-3.5 py-[7px] text-[13px] font-medium text-white"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {t('proof_feedback')}
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
              <ButtonLink
                href={ctaHref}
                data-testid="landing-hero-cta-primary-button"
                size="lg"
                className="h-11 min-h-[44px] px-7 rounded-[10px] bg-white text-[#5b4a9a] hover:bg-white/90 font-semibold text-[15px] shadow-[0_8px_24px_rgba(80,50,130,0.18)]"
              >
                {t('cta_primary')}
              </ButtonLink>
              <a
                href="#precos"
                data-testid="landing-hero-cta-secondary-button"
                className="text-white text-[15px] font-medium underline underline-offset-[6px] decoration-white hover:text-white/90 px-1"
              >
                {t('cta_secondary')}
              </a>
            </div>
            <p data-testid="landing-hero-microcopy" className="text-[13px] font-medium text-white">
              {t('microcopy', { price: formatUsd(FIRST_LESSON_USD, locale) })}
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[460px] min-w-0 rounded-[10px] bg-white/70 p-[10px] shadow-[0_18px_50px_rgba(90,50,140,0.18)]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[10px]">
                <Image
                  src="/images/hero-pedro.png"
                  alt={t('professor_alt')}
                  fill
                  sizes="(max-width: 1024px) 100vw, 460px"
                  className="object-cover object-[30%_18%]"
                  priority
                  fetchPriority="high"
                />
                <div
                  data-testid="landing-hero-overlay"
                  className="absolute bottom-3 inset-x-3 rounded-[10px] bg-[#1B2140]/70 backdrop-blur-md text-white px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-white/40">
                      <Image src="/images/professor-pedro.png" alt="" fill sizes="28px" className="object-cover object-top" />
                    </span>
                    <p className="text-[12px] sm:text-[13px] font-semibold leading-tight">
                      {t('overlay_name')}
                    </p>
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] whitespace-nowrap rounded-[10px] bg-white/15 px-2.5 py-1 flex-shrink-0">
                    <Calendar className="h-3.5 w-3.5" />
                    {t('overlay_chip', { minutes: LESSON_DURATION_MINUTES })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
