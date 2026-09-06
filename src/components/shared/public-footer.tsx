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
    <footer data-testid="footer" className="bg-[#1B2140] py-9 text-zinc-100">
      <div className="max-w-[1120px] mx-auto px-5 md:px-6 flex flex-col gap-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <BrandLogo variant="light" markClassName="h-8" wordmarkClassName="text-[1.45rem]" />
            <p className="text-[13px] text-white/70 mt-2.5 max-w-sm">{t('tagline')}</p>
          </div>
          <nav data-testid="footer-nav" className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[14px] text-white/75">
            <a href="/#metodo" className="hover:text-white">{t('method')}</a>
            <a href="/#precos" className="hover:text-white">{t('pricing')}</a>
            <a href="/#faq" className="hover:text-white">{t('faq')}</a>
            <Link href={ROUTES.PRIVACY} data-testid="footer-privacy-link" className="hover:text-white">
              {t('privacy_short')}
            </Link>
            <Link href={ROUTES.TERMS} data-testid="footer-terms-link" className="hover:text-white">
              {t('terms_short')}
            </Link>
          </nav>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p data-testid="footer-copyright" className="text-[13px] text-white/55">
            {t('copyright', { year })}
          </p>
          <div data-testid="footer-links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href="mailto:support@corgly.app"
              data-testid="footer-email-link"
              className="inline-flex items-center gap-2 text-[13px] text-white/80 hover:text-white"
            >
              <Mail className="h-4 w-4" />
              support@corgly.app
            </a>
            <a
              href="https://www.instagram.com/corgly.app/"
              data-testid="footer-instagram-link"
              className="sr-only"
              target="_blank"
              rel="noopener noreferrer"
            >
              @corgly.app
            </a>
            <Link href={ROUTES.COOKIES} data-testid="footer-cookies-link" className="text-[12px] text-white/40 hover:text-white/70">
              {t('cookies')}
            </Link>
            <Link href={ROUTES.COOKIE_PREFERENCES} data-testid="footer-cookie-preferences-link" className="text-[12px] text-white/40 hover:text-white/70">
              {t('preferences')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
