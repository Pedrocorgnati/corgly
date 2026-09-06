'use client';

import { useTranslations } from 'next-intl';
import {
  IconCalendarClock,
  IconLiveLesson,
  IconFeedbackDoc,
  IconNextCycle,
} from '@/components/landing/landing-icons';

const STEPS = [
  { n: '01' as const, icon: IconCalendarClock },
  { n: '02' as const, icon: IconLiveLesson },
  { n: '03' as const, icon: IconFeedbackDoc },
  { n: '04' as const, icon: IconNextCycle },
];

export function HowItWorksSection() {
  const t = useTranslations('landing.how_it_works');

  return (
    <section
      data-testid="landing-how-it-works"
      id="como-funciona"
      className="py-[4.75rem] md:py-24 bg-white"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-[1120px] mx-auto px-5 md:px-6">
        <p className="text-[15px] font-medium text-[#7c5cbf] text-center mb-3">{t('eyebrow')}</p>
        <h2
          id="how-it-works-heading"
          className="text-[1.85rem] md:text-[2.35rem] font-bold text-[#1B2140] text-center tracking-tight leading-tight"
        >
          {t('title')}
        </h2>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {STEPS.map(({ n, icon: Icon }) => (
            <article
              key={n}
              data-testid={`landing-how-it-works-step-${n}`}
              className="rounded-[10px] border-[1.5px] border-[#c4b0e8] bg-white px-6 py-8 text-center flex flex-col items-center min-h-[300px]"
            >
              <p className="text-[13px] font-medium tracking-[0.16em] text-[#9b7ed4]">{n}</p>
              <h3 className="mt-1.5 text-[1.15rem] font-semibold text-[#1B2140] leading-snug">
                {t(`steps.${n}.title`)}
              </h3>
              <div className="relative mt-7 mb-auto">
                <Icon className="h-[5.5rem] w-[5.5rem] text-[#7c5cbf]" />
                {n === '02' && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-[10px] border border-[#7c5cbf] bg-white px-2 py-[1px] text-[9px] font-bold tracking-[0.14em] text-[#7c5cbf]">
                    LIVE
                  </span>
                )}
              </div>
              <p className="mt-7 text-[13.5px] text-slate-500 leading-[1.55]">{t(`steps.${n}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
