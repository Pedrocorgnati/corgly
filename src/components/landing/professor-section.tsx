'use client';

import Image from 'next/image';
import { CheckCircle2, Clock, Globe, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

const CHECK_KEYS = ['adults', 'fluency', 'certified'] as const;
const METRICS = [
  { key: 'years' as const, icon: Clock },
  { key: 'countries' as const, icon: Globe },
  { key: 'one_to_one' as const, icon: User },
];

export function ProfessorSection() {
  const t = useTranslations('landing.professor');

  return (
    <section data-testid="landing-professor" className="py-[4.5rem] md:py-24 bg-white" aria-labelledby="professor-heading">
      <div className="max-w-[1120px] mx-auto px-5 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-12 lg:gap-20 items-center">
          <div className="flex justify-center lg:justify-start">
            <div
              data-testid="landing-professor-photo"
              className="relative w-[260px] h-[260px] md:w-[320px] md:h-[320px] rounded-full overflow-hidden bg-[#eee9e4]"
            >
              <Image
                src="/images/professor-pedro.png"
                alt={t('image_alt')}
                fill
                sizes="320px"
                className="object-cover object-[center_10%]"
              />
            </div>
          </div>
          <div className="max-w-[640px]">
            <p className="inline-flex items-center gap-2 rounded-[10px] bg-[#efe7fb] px-3.5 py-1.5 text-[13px] font-medium text-[#7c5cbf]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7c5cbf] text-white">
                <Globe className="h-3.5 w-3.5" />
              </span>
              {t('badge')}
            </p>
            <h2
              id="professor-heading"
              className="mt-4 text-[2.35rem] md:text-[3.15rem] font-semibold tracking-tight text-[#1B2140] leading-[1.12]"
            >
              {t('title')}
            </h2>
            <span className="mt-3 block h-[3px] w-[4.5rem] rounded-full bg-[#c9b6ea]" />
            <p className="mt-5 text-[1.02rem] text-slate-600 leading-[1.7]">{t('bio')}</p>
            <ul
              data-testid="landing-professor-metrics"
              className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6"
            >
              {METRICS.map(({ key, icon: Icon }, idx) => (
                <li
                  key={key}
                  className={idx === 0 ? '' : 'sm:border-l sm:border-slate-200 sm:pl-6'}
                >
                  <p className="flex items-center gap-2.5 text-[1.35rem] font-semibold text-[#1B2140] leading-none">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d9c8f3] text-[#7c5cbf]">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {t(`metrics.${key}.value`)}
                  </p>
                  <p className="mt-2 text-[13px] text-slate-500 leading-snug pl-[3.25rem] sm:pl-0">
                    {t(`metrics.${key}.label`)}
                  </p>
                </li>
              ))}
            </ul>
            <ul className="mt-8 space-y-3.5" aria-label={t('credentials_aria')}>
              {CHECK_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#22a06b] flex-shrink-0 mt-0.5" />
                  <span className="text-[15px] text-slate-700 leading-snug">{t(`checks.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
