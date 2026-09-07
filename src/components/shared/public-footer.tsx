'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/lib/constants/routes';
import { BrandLogo } from '@/components/brand/brand-logo';

export function PublicFooter() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();
  return (
    <footer data-testid="footer" className="pc-footer">
      <div className="pc-footer__inner">
        <div className="pc-footer__top">
          <div>
            <BrandLogo variant="light" className="pc-brand pc-brand--light" />
            <p className="pc-footer__tagline">{t('tagline')}</p>
          </div>
          <nav data-testid="footer-nav" className="pc-footer__nav">
            <a href="/#metodo">{t('method')}</a>
            <a href="/#precos">{t('pricing')}</a>
            <a href="/#faq">{t('faq')}</a>
            <Link href={ROUTES.PRIVACY} data-testid="footer-privacy-link">
              {t('privacy_short')}
            </Link>
            <Link href={ROUTES.TERMS} data-testid="footer-terms-link">
              {t('terms_short')}
            </Link>
          </nav>
        </div>
        <div className="pc-footer__divider" />
        <div className="pc-footer__bottom">
          <p data-testid="footer-copyright" className="pc-footer__copyright">
            {t('copyright', { year })}
          </p>
          <div data-testid="footer-links" className="pc-footer__links">
            <a
              href="mailto:support@corgly.app"
              data-testid="footer-email-link"
              className="pc-footer__email"
            >
              <Mail />
              support@corgly.app
            </a>
            <a
              href="https://www.instagram.com/corgly.app/"
              data-testid="footer-instagram-link"
              className="pc-sr-only"
              target="_blank"
              rel="noopener noreferrer"
            >
              @corgly.app
            </a>
            <Link href={ROUTES.COOKIES} data-testid="footer-cookies-link" className="pc-footer__minor">
              {t('cookies')}
            </Link>
            <Link
              href={ROUTES.COOKIE_PREFERENCES}
              data-testid="footer-cookie-preferences-link"
              className="pc-footer__minor"
            >
              {t('preferences')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
