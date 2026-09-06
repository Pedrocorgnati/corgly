'use client';

import { useTranslations } from 'next-intl';
import {
  IconShieldHeart,
  IconCycleArrows,
  IconChatPair,
  IconChatHeart,
} from '@/components/landing/landing-icons';

const PILLARS = [
  { key: 'commitment', icon: IconShieldHeart },
  { key: 'closed_cycle', icon: IconCycleArrows },
  { key: 'continuous_context', icon: IconChatPair },
  { key: 'real_feedback', icon: IconChatHeart },
] as const;

export function MethodSection() {
  const t = useTranslations('landing.method');

  return (
    <section data-testid="landing-method" className="py-[4.75rem] md:py-24 bg-method-lilac" id="metodo" aria-labelledby="method-heading">
      <div className="max-w-[1120px] mx-auto px-5 md:px-6">
        <div className="text-center mb-12">
          <h2 id="method-heading" className="text-[1.85rem] md:text-[2.5rem] font-semibold tracking-tight text-[#3b2b63] leading-tight">
            {t('title')}
          </h2>
          <span className="mx-auto mt-4 block h-px w-40 bg-[#d7c8ee]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {PILLARS.map(({ key, icon: Icon }) => (
            <article
              key={key}
              data-testid={`landing-method-pillar-${key.replace(/_/g, '-')}`}
              className="rounded-[10px] bg-white px-7 py-10 text-center shadow-[0_8px_24px_rgba(90,50,140,0.06)]"
            >
              <Icon className="mx-auto h-14 w-14 text-[#7c5cbf]" />
              <h3 className="mt-6 text-[1.15rem] font-semibold text-[#1B2140]">{t(`pillars.${key}.title`)}</h3>
              <span className="mx-auto mt-3 block h-px w-9 bg-[#d7c8ee]" />
              <p className="mt-3 text-[14px] text-slate-500 leading-[1.55]">{t(`pillars.${key}.description`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
