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
    <section
      data-testid="landing-method"
      className="lp-method"
      id="metodo"
      aria-labelledby="method-heading"
    >
      <div className="lp-container">
        <div className="lp-method__head">
          <h2 id="method-heading" className="lp-method__title">
            {t('title')}
          </h2>
          <span className="lp-method__rule" />
        </div>
        <div className="lp-method__grid">
          {PILLARS.map(({ key, icon: Icon }) => (
            <article
              key={key}
              data-testid={`landing-method-pillar-${key.replace(/_/g, '-')}`}
              className="lp-method__card"
            >
              <Icon className="lp-method__icon" />
              <h3 className="lp-method__card-title">{t(`pillars.${key}.title`)}</h3>
              <span className="lp-method__card-rule" />
              <p className="lp-method__card-body">{t(`pillars.${key}.description`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
