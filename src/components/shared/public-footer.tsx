'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/lib/constants/routes';

export function PublicFooter() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface py-6">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t('copyright', { year })}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href={ROUTES.PRIVACY}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('privacy')}
          </Link>
          <Link
            href={ROUTES.TERMS}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('terms')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
