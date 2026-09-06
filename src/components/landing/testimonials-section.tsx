'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FEATURED_IDS, ROW2_IDS, TESTIMONIALS, type Testimonial } from '@/lib/landing/testimonials';

function byId(id: string): Testimonial {
  const found = TESTIMONIALS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing testimonial ${id}`);
  return found;
}

function uiLang(locale: string): 'en' | 'pt' | 'es' | 'it' {
  if (locale.startsWith('pt')) return 'pt';
  if (locale.startsWith('es')) return 'es';
  if (locale.startsWith('it')) return 'it';
  return 'en';
}

function TestimonialCard({ item, showTranslation }: { item: Testimonial; showTranslation: boolean }) {
  const locale = useLocale();
  const lang = uiLang(locale);
  const text = showTranslation ? item.translations[lang] : item.original;
  const initial = item.name.trim().charAt(0).toUpperCase();

  return (
    <article
      data-testid={`landing-testimonials-card-${item.id}`}
      className="h-full rounded-[10px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(90,50,140,0.06)]"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#efe7fb] text-[#7c5cbf] text-[14px] font-semibold">
          {initial}
        </span>
        <div>
          <p className="text-[14px] font-semibold text-[#1B2140]">{item.name}</p>
          <p className="text-[12px] text-slate-500 uppercase tracking-[0.06em]">{item.lang}</p>
        </div>
      </div>
      <p className="mt-4 text-[14.5px] text-slate-700 leading-[1.7]">&ldquo;{text}&rdquo;</p>
    </article>
  );
}

export function TestimonialsSection() {
  const t = useTranslations('landing.testimonials');
  const locale = useLocale();
  const [showTranslation, setShowTranslation] = useState(false);
  const featured = useMemo(() => FEATURED_IDS.map(byId), []);
  const row2 = useMemo(() => ROW2_IDS.map(byId), []);

  return (
    <section
      data-testid="landing-testimonials"
      className="py-[4.5rem] md:py-20 bg-white"
      aria-labelledby="testimonials-heading"
    >
      <div className="max-w-[1120px] mx-auto px-5 md:px-6">
        <div className="text-center mb-10">
          <h2
            id="testimonials-heading"
            className="text-[2rem] md:text-[2.6rem] font-bold tracking-tight text-[#1B2140] leading-[1.14]"
          >
            {t('title')}
          </h2>
          <span className="mt-3 mx-auto block h-[3px] w-9 rounded-full bg-[#7c5cbf]" />
          <p className="mt-5 text-[1.02rem] text-slate-600 leading-[1.7]">{t('subtitle')}</p>
          <p className="mt-2 text-[14px] font-semibold text-[#3b2b63]">{t('band')}</p>
          <button
            type="button"
            data-testid="landing-testimonials-translate-toggle"
            className="mt-5 text-[13.5px] font-semibold underline underline-offset-4 text-[#7c5cbf] hover:text-[#6d4fb0]"
            onClick={() => setShowTranslation((v) => !v)}
          >
            {showTranslation ? t('show_original') : t('show_translation')}
          </button>
        </div>

        <div data-testid="landing-testimonials-featured" className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {featured.map((item) => (
            <TestimonialCard key={item.id} item={item} showTranslation={showTranslation} />
          ))}
        </div>
        <div data-testid="landing-testimonials-row-2" className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {row2.map((item) => (
            <TestimonialCard key={item.id} item={item} showTranslation={showTranslation} />
          ))}
        </div>

        <details
          data-testid="landing-testimonials-details"
          className="mt-8 rounded-[10px] border border-slate-200 bg-white p-5"
        >
          <summary className="cursor-pointer text-[14px] font-semibold text-[#1B2140]">
            {t('all_15')}
          </summary>
          <ul className="mt-5 space-y-4">
            {TESTIMONIALS.map((item) => (
              <li key={item.id} className="text-[14px]">
                <span className="font-semibold text-[#1B2140]">{item.name}</span>
                <span className="text-slate-500"> · {item.lang.toUpperCase()}</span>
                <p className="mt-1 text-slate-600 leading-[1.7]">
                  {showTranslation ? item.translations[uiLang(locale)] : item.original}
                </p>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
