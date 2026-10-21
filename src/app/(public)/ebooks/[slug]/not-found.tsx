import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button-variants';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EbookSegmentNotFound() {
  const t = await getTranslations('ebooks');

  return (
    <div data-testid="page-ebooks-not-found" className="max-w-xl mx-auto px-4 py-16">
      <h1 data-testid="ebooks-not-found-title" className="text-2xl font-bold text-foreground">
        {t('notFound.title')}
      </h1>
      <p data-testid="ebooks-not-found-description" className="mt-3 text-base text-muted-foreground">
        {t('notFound.description')}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          data-testid="ebooks-not-found-catalog-link"
          href={ROUTES.EBOOKS}
          className={cn(buttonVariants())}
        >
          {t('notFound.backToCatalog')}
        </Link>
        <Link
          data-testid="ebooks-not-found-home-link"
          href={ROUTES.HOME}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          {t('notFound.backHome')}
        </Link>
      </div>
    </div>
  );
}
