'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

const FAQ_KEYS = [
  'duration',
  'cancel',
  'credits',
  'pack_vs_monthly',
  'beginner',
  'intensive',
  'business',
  'brazil_vs_pt',
  'first_lesson',
  'timezone',
  'platform',
  'payment',
] as const;

/**
 * O acordeao e `<details>/<summary>` nativo, nao o componente shadcn.
 *
 * Dois motivos: (1) o shadcn desenha tudo com utilitarios do Tailwind, e a home
 * inteira saiu do Tailwind para nao depender do chunk unico de CSS que ja
 * chegou vazio em producao (ver o cabecalho de `src/app/(public)/landing.css`);
 * (2) `<details>` abre e fecha sem JavaScript, o que importa numa pagina
 * servida do cache com `revalidate 3600` — sem hidratacao, um acordeao movido a
 * JS deixaria as 12 respostas inalcancaveis.
 */
export function FAQSection() {
  const t = useTranslations('landing.faq');

  return (
    <section data-testid="landing-faq" className="lp-faq" id="faq" aria-labelledby="faq-heading">
      <div className="lp-faq__container">
        <div className="lp-faq__head">
          <h2 id="faq-heading" className="lp-faq__title">
            {t('title')}
          </h2>
          <span className="lp-rule lp-rule--center lp-faq__rule" />
        </div>
        <div data-testid="landing-faq-list" className="lp-faq__list">
          {FAQ_KEYS.map((key, idx) => (
            <details
              key={key}
              data-testid={`landing-faq-item-${key.replace(/_/g, '-')}`}
              className="lp-faq__item"
              open={idx === 0}
            >
              <summary
                data-testid={`landing-faq-item-${key.replace(/_/g, '-')}-trigger`}
                className="lp-faq__trigger"
              >
                {t(`items.${key}.q`)}
                <span className="lp-faq__toggle" aria-hidden="true">
                  <Plus className="lp-faq__icon--plus" />
                  <Minus className="lp-faq__icon--minus" />
                </span>
              </summary>
              <div className="lp-faq__answer">{t(`items.${key}.a`)}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
