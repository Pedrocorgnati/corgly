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
      className="lp-testi__card"
    >
      <div className="lp-testi__card-head">
        <span className="lp-testi__avatar">{initial}</span>
        <div>
          <p className="lp-testi__name">{item.name}</p>
          <p className="lp-testi__lang">{item.lang}</p>
        </div>
      </div>
      <p className="lp-testi__quote">&ldquo;{text}&rdquo;</p>
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
      className="lp-testi"
      aria-labelledby="testimonials-heading"
    >
      <div className="lp-container">
        <div className="lp-testi__head">
          <h2 id="testimonials-heading" className="lp-testi__title">
            {t('title')}
          </h2>
          <span className="lp-rule lp-rule--center lp-testi__rule" />
          <p className="lp-testi__subtitle">{t('subtitle')}</p>
          <p className="lp-testi__band">{t('band')}</p>
          <button
            type="button"
            data-testid="landing-testimonials-translate-toggle"
            className="lp-testi__toggle"
            onClick={() => setShowTranslation((v) => !v)}
          >
            {showTranslation ? t('show_original') : t('show_translation')}
          </button>
        </div>

        <div
          data-testid="landing-testimonials-featured"
          className="lp-testi__grid lp-testi__grid--featured"
        >
          {featured.map((item) => (
            <TestimonialCard key={item.id} item={item} showTranslation={showTranslation} />
          ))}
        </div>
        <div data-testid="landing-testimonials-row-2" className="lp-testi__grid">
          {row2.map((item) => (
            <TestimonialCard key={item.id} item={item} showTranslation={showTranslation} />
          ))}
        </div>

        <details data-testid="landing-testimonials-details" className="lp-testi__details">
          <summary className="lp-testi__summary">{t('all_15')}</summary>
          <ul className="lp-testi__all">
            {TESTIMONIALS.map((item) => (
              <li key={item.id} className="lp-testi__all-item">
                <span className="lp-testi__all-name">{item.name}</span>
                <span className="lp-testi__all-lang"> · {item.lang.toUpperCase()}</span>
                <p className="lp-testi__all-text">
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
