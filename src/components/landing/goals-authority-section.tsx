'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const CHIP_KEYS = ['zero', 'travel', 'move', 'work', 'family', 'confidence'] as const;
const AUTHORITY_KEYS = ['rating', 'countries', 'postgrad', 'background'] as const;

export function GoalsAuthoritySection() {
  const t = useTranslations('landing.goals');

  return (
    <section
      data-testid="landing-goals-authority"
      className="py-[4.5rem] md:py-20 bg-method-lilac"
      aria-labelledby="goals-heading"
    >
      <div className="max-w-[1120px] mx-auto px-5 md:px-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div>
          <p className="text-[13px] font-semibold text-[#7c5cbf] mb-2">{t('eyebrow')}</p>
          <h2
            id="goals-heading"
            className="text-[2rem] md:text-[2.6rem] font-bold tracking-tight text-[#3b2b63] leading-[1.14]"
          >
            {t('title')}
          </h2>
          <span className="mt-3 block h-[3px] w-9 rounded-full bg-[#7c5cbf]" />
          <div className="mt-7 flex flex-wrap gap-2.5">
            {CHIP_KEYS.map((key) => (
              <span
                key={key}
                data-testid={`landing-goals-chip-${key}`}
                className="inline-flex rounded-[10px] border border-[#d7c8ee] bg-white px-3.5 py-[7px] text-[13.5px] text-slate-700 shadow-[0_8px_24px_rgba(90,50,140,0.06)]"
              >
                {t(`chips.${key}`)}
              </span>
            ))}
          </div>
        </div>
        <ul className="space-y-3.5">
          {AUTHORITY_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#22a06b] flex-shrink-0 mt-0.5" />
              <span className="text-[15px] text-slate-700 leading-snug">{t(`authority.${key}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
