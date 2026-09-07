'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SessionAwareCta } from '@/components/landing/pricing-section';
import { firstLessonHref, formatUsd, FIRST_LESSON_USD } from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';

export function CTASection() {
  const t = useTranslations('landing.cta');
  const locale = useLocale();
  // A sondagem de sessao tem TRES estados e este CTA precisa dos tres: ler so
  // `isAuthenticated` manda o aluno ja logado para o cadastro enquanto
  // `GET /auth/me` ainda esta em voo. `SessionAwareCta` (mesmo componente do
  // hero e da vitrine) trata a espera sem deixar o CTA sem destino.
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section data-testid="landing-cta" className="lp-cta" aria-labelledby="cta-heading">
      <div className="lp-container lp-cta__inner">
        <h2 id="cta-heading" className="lp-cta__title">
          {t('title')}
        </h2>
        <p className="lp-sr-only">{t('subtitle')}</p>
        <SessionAwareCta
          isLoading={isLoading}
          isAuthenticated={isAuthenticated}
          buildHref={firstLessonHref}
          testId="landing-cta-primary-button"
          className="lp-btn lp-btn--white lp-cta__button"
        >
          {t('button', { price: formatUsd(FIRST_LESSON_USD, locale) })}
        </SessionAwareCta>
      </div>
    </section>
  );
}
