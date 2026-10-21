import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { EbookCatalogList } from '@/components/ebooks/ebook-catalog-list';
import { ROUTES } from '@/lib/constants/routes';
import { listEbooks } from '@/lib/ebooks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ebooks');

  return {
    title: t('catalog.metaTitle'),
    description: t('catalog.metaDescription'),
    alternates: { canonical: ROUTES.EBOOKS },
  };
}

export default async function EbooksCatalogPage() {
  const t = await getTranslations('ebooks');

  return (
    <div data-testid="page-ebooks-catalog" className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-bold text-foreground">{t('catalog.title')}</h1>
      <p className="mt-3 text-base text-muted-foreground">{t('catalog.intro')}</p>
      <div className="mt-10">
        <EbookCatalogList
          entries={listEbooks()}
          labels={{
            viewEbook: t('catalog.viewEbook'),
            empty: t('catalog.empty'),
            emptyCta: t('catalog.emptyCta'),
          }}
        />
      </div>
    </div>
  );
}
