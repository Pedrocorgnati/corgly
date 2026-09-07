'use client';

import Image from 'next/image';
import { CheckCircle2, Clock, Globe, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * A propriedade se chama `metricKey`, e nao `key`, de proposito: `CHECK_KEYS`
 * logo acima tambem e iterado com uma variavel chamada `key`, e a guarda
 * estatica de i18n (`src/__tests__/i18n/_message-scan.ts`) casava o primeiro
 * pool que encontrasse — classificando `metrics.${key}.value` e
 * `metrics.${key}.label` como NAO VERIFICAVEIS. Nome de propriedade proprio
 * amarra cada template ao seu pool e devolve os dois consumos a verificacao.
 */
const CHECK_KEYS = ['adults', 'fluency', 'certified'] as const;
const METRICS = [
  { metricKey: 'years' as const, icon: Clock },
  { metricKey: 'countries' as const, icon: Globe },
  { metricKey: 'one_to_one' as const, icon: User },
];

export function ProfessorSection() {
  const t = useTranslations('landing.professor');

  return (
    <section data-testid="landing-professor" className="lp-prof" aria-labelledby="professor-heading">
      <div className="lp-container">
        <div className="lp-prof__grid">
          <div className="lp-prof__photo-col">
            <div data-testid="landing-professor-photo" className="lp-prof__photo">
              <Image
                src="/images/professor-pedro.png"
                alt={t('image_alt')}
                fill
                sizes="320px"
              />
            </div>
          </div>
          <div className="lp-prof__content">
            <p className="lp-prof__badge">
              <span className="lp-prof__badge-icon">
                <Globe />
              </span>
              {t('badge')}
            </p>
            <h2 id="professor-heading" className="lp-prof__title">
              {t('title')}
            </h2>
            <span className="lp-rule lp-prof__rule" />
            <p className="lp-prof__bio">{t('bio')}</p>
            <ul data-testid="landing-professor-metrics" className="lp-prof__metrics">
              {METRICS.map(({ metricKey, icon: Icon }, idx) => (
                <li
                  key={metricKey}
                  className={idx === 0 ? undefined : 'lp-prof__metric--divided'}
                >
                  <p className="lp-prof__metric-value">
                    <span className="lp-prof__metric-icon">
                      <Icon />
                    </span>
                    {t(`metrics.${metricKey}.value`)}
                  </p>
                  <p className="lp-prof__metric-label">{t(`metrics.${metricKey}.label`)}</p>
                </li>
              ))}
            </ul>
            <ul className="lp-prof__checks" aria-label={t('credentials_aria')}>
              {CHECK_KEYS.map((key) => (
                <li key={key} className="lp-check">
                  <CheckCircle2 className="lp-check__icon" />
                  <span className="lp-check__text">{t(`checks.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
