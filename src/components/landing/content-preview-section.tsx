'use client';

import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/lib/constants/routes';

export function ContentPreviewSection() {
  const t = useTranslations('landing');

  return (
    <section data-testid="landing-content-preview" className="lp-content" aria-labelledby="content-heading">
      <div className="lp-container lp-content__inner">
        <span className="lp-content__badge">{t('content_preview.badge')}</span>
        <h2 id="content-heading" className="lp-content__title">
          {t('content_preview.title')}
        </h2>
        <p className="lp-content__subtitle">{t('content_preview.subtitle')}</p>
        <div className="lp-content__actions">
          <div className="lp-content__icon-circle">
            <PlayCircle />
          </div>
          <Link href={ROUTES.CONTENT}>
            <button
              type="button"
              data-testid="landing-content-preview-cta-button"
              className="lp-btn lp-btn--outline"
            >
              {t('content_preview.cta')}
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}
