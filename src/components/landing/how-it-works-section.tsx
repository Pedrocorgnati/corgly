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
      className="lp-how"
      aria-labelledby="how-it-works-heading"
    >
      <div className="lp-container">
        <p className="lp-how__eyebrow">{t('eyebrow')}</p>
        <h2 id="how-it-works-heading" className="lp-how__title">
          {t('title')}
        </h2>
        <div className="lp-how__grid">
          {STEPS.map(({ n, icon: Icon }) => (
            <article
              key={n}
              data-testid={`landing-how-it-works-step-${n}`}
              className="lp-how__card"
            >
              <p className="lp-how__num">{n}</p>
              <h3 className="lp-how__card-title">{t(`steps.${n}.title`)}</h3>
              <div className="lp-how__icon-wrap">
                <Icon className="lp-how__icon" />
                {n === '02' && <span className="lp-how__live">LIVE</span>}
              </div>
              <p className="lp-how__body">{t(`steps.${n}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
