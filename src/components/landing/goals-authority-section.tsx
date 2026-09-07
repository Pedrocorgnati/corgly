'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Os dois pools sao iterados com nomes de variavel DISTINTOS (`chipKey`,
 * `authorityKey`) de proposito. Enquanto os dois `.map()` chamavam a variavel de
 * `key`, a guarda estatica de i18n (`src/__tests__/i18n/_message-scan.ts`) nao
 * tinha como saber qual pool alimentava qual template: casava o primeiro pool
 * declarado e desistia, classificando `authority.${key}` como NAO VERIFICAVEL —
 * ou seja, uma chave publicada e consumida que nenhuma guarda cobria. Nome
 * distinto por pool devolve os dois consumos a verificacao.
 */
const CHIP_KEYS = ['zero', 'travel', 'move', 'work', 'family', 'confidence'] as const;
const AUTHORITY_KEYS = ['rating', 'countries', 'postgrad', 'background'] as const;

export function GoalsAuthoritySection() {
  const t = useTranslations('landing.goals');

  return (
    <section
      data-testid="landing-goals-authority"
      className="lp-goals"
      aria-labelledby="goals-heading"
    >
      <div className="lp-container lp-goals__grid">
        <div>
          <p className="lp-goals__eyebrow">{t('eyebrow')}</p>
          <h2 id="goals-heading" className="lp-goals__title">
            {t('title')}
          </h2>
          <span className="lp-rule lp-goals__rule" />
          <div className="lp-goals__chips">
            {CHIP_KEYS.map((chipKey) => (
              <span
                key={chipKey}
                data-testid={`landing-goals-chip-${chipKey}`}
                className="lp-goals__chip"
              >
                {t(`chips.${chipKey}`)}
              </span>
            ))}
          </div>
        </div>
        <ul className="lp-goals__list">
          {AUTHORITY_KEYS.map((authorityKey) => (
            <li key={authorityKey} className="lp-check">
              <CheckCircle2 className="lp-check__icon" />
              <span className="lp-check__text">{t(`authority.${authorityKey}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
