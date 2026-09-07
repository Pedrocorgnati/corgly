'use client';

import Image from 'next/image';
import { Globe, Clock, MessageCircle, Calendar } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { SessionAwareCta } from '@/components/landing/pricing-section';
import { firstLessonHref, formatUsd, FIRST_LESSON_USD, LESSON_DURATION_MINUTES } from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const t = useTranslations('landing.hero');
  const locale = useLocale();
  // A sondagem de sessao tem TRES estados e o CTA principal precisa dos tres:
  // ler so `isAuthenticated` manda aluno logado para o cadastro enquanto
  // `GET /auth/me` ainda esta em voo. `SessionAwareCta` trata a espera sem
  // deixar o CTA sem destino (ver o componente para o contrato completo).
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section data-testid="landing-hero" className="lp-hero" aria-labelledby="hero-heading">
      <div className="lp-container lp-hero__inner">
        <div className="lp-hero__grid">
          <div className="lp-hero__copy">
            <p className="lp-hero__eyebrow">
              <Image src="/flags/br.svg" alt="" width={22} height={16} className="lp-hero__flag" />
              <span>{t('eyebrow')}</span>
            </p>
            <h1 id="hero-heading" className="lp-hero__title">
              {t('title')}
            </h1>
            <p className="lp-hero__subtitle">{t('subtitle')}</p>
            <ul className="lp-hero__proofs">
              <li data-testid="landing-hero-proof-countries" className="lp-hero__proof">
                <Globe className="lp-hero__proof-icon" />
                {t('proof_countries')}
              </li>
              <li data-testid="landing-hero-proof-duration" className="lp-hero__proof">
                <Clock className="lp-hero__proof-icon" />
                {t('proof_duration')}
              </li>
              <li data-testid="landing-hero-proof-feedback" className="lp-hero__proof">
                <MessageCircle className="lp-hero__proof-icon" />
                {t('proof_feedback')}
              </li>
            </ul>
            <div className="lp-hero__actions">
              <SessionAwareCta
                isLoading={isLoading}
                isAuthenticated={isAuthenticated}
                buildHref={firstLessonHref}
                testId="landing-hero-cta-primary-button"
                className="lp-btn lp-btn--white"
              >
                {t('cta_primary')}
              </SessionAwareCta>
              <a
                href="#precos"
                data-testid="landing-hero-cta-secondary-button"
                className="lp-hero__cta-secondary"
              >
                {t('cta_secondary')}
              </a>
            </div>
            <p data-testid="landing-hero-microcopy" className="lp-hero__microcopy">
              {t('microcopy', { price: formatUsd(FIRST_LESSON_USD, locale) })}
            </p>
          </div>

          <div className="lp-hero__media">
            <div className="lp-hero__frame">
              <div className="lp-hero__photo-wrap">
                <Image
                  src="/images/hero-pedro.png"
                  alt={t('professor_alt')}
                  fill
                  sizes="(max-width: 1024px) 100vw, 460px"
                  className="lp-hero__photo"
                  priority
                  fetchPriority="high"
                />
                <div data-testid="landing-hero-overlay" className="lp-hero__overlay">
                  <div className="lp-hero__overlay-id">
                    <span className="lp-hero__avatar">
                      <Image src="/images/professor-pedro.png" alt="" fill sizes="28px" />
                    </span>
                    <p className="lp-hero__overlay-name">{t('overlay_name')}</p>
                  </div>
                  <p className="lp-hero__overlay-chip">
                    <Calendar />
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
