import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EBOOK_LOCALE_TO_APP_LOCALE } from '@/components/ebooks/locale';
import { EbookSalesPage } from '@/components/ebooks/ebook-sales-page';
import { ROUTES } from '@/lib/constants/routes';
import { getEbookBySlug, listEbooks } from '@/lib/ebooks';
import { EBOOK_RESERVED_SLUGS } from '@/lib/ebooks/schema';
import type { EbookCatalogEntry } from '@/lib/ebooks/schema';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Slug reservado ou desconhecido nao tem pagina de venda.
function resolveEntry(slug: string): EbookCatalogEntry | undefined {
  if ((EBOOK_RESERVED_SLUGS as readonly string[]).includes(slug)) return undefined;
  return getEbookBySlug(slug);
}

export function generateStaticParams() {
  return listEbooks().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = resolveEntry(slug);
  if (!entry) return {};

  return {
    title: entry.copy.seo.title,
    description: entry.copy.seo.description,
    alternates: { canonical: ROUTES.EBOOK_DETAIL(slug) },
    openGraph: {
      title: entry.copy.seo.title,
      description: entry.copy.seo.description,
      url: ROUTES.EBOOK_DETAIL(slug),
      type: 'website',
      images: [
        {
          url: entry.images.cover.src,
          width: entry.images.cover.width,
          height: entry.images.cover.height,
          alt: entry.images.cover.alt,
        },
      ],
    },
  };
}

export default async function EbookDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = resolveEntry(slug);
  if (!entry) notFound();

  const t = await getTranslations({ locale: EBOOK_LOCALE_TO_APP_LOCALE[entry.locale], namespace: 'ebooks' });

  return (
    <EbookSalesPage
      entry={entry}
      labels={{
        priceLabel: t('sale.priceLabel'),
        summaryTitle: t('sale.summaryTitle'),
        faqTitle: t('sale.faqTitle'),
        buyButton: {
          labels: {
            buy: t('sale.buyLabel'),
            loading: t('sale.loading'),
            waiver: t('sale.waiverLabel'),
          },
          errors: {
            rateLimited: t('sale.errors.rateLimited', { seconds: '{seconds}' }),
            rateLimitedNoWait: t('sale.errors.rateLimitedNoWait'),
            failed: t('sale.errors.failed'),
            network: t('sale.errors.network'),
          },
        },
      }}
    />
  );
}
