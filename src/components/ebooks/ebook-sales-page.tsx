import type { EbookCatalogEntry } from '@/lib/ebooks/schema';

import type { EbookBuyButtonErrors, EbookBuyButtonLabels } from './ebook-buy-button';
import { EbookAiNotice } from './ebook-ai-notice';
import { EbookFaq } from './ebook-faq';
import { EbookGuarantee } from './ebook-guarantee';
import { EbookHero } from './ebook-hero';
import { EbookPurchaseCta } from './ebook-purchase-cta';
import { EbookSummary } from './ebook-summary';

export interface EbookSalesPageLabels {
  priceLabel: string;
  summaryTitle: string;
  faqTitle: string;
  buyButton: { labels: EbookBuyButtonLabels; errors: EbookBuyButtonErrors };
}

export function EbookSalesPage({
  entry,
  labels,
}: {
  entry: EbookCatalogEntry;
  labels: EbookSalesPageLabels;
}) {
  return (
    <article
      data-testid="ebook-sales-page"
      lang={entry.locale}
      className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12"
    >
      <EbookHero entry={entry} />
      <EbookSummary items={entry.copy.summary} title={labels.summaryTitle} />
      <EbookPurchaseCta entry={entry} priceLabel={labels.priceLabel} buyButton={labels.buyButton} />
      <EbookFaq items={entry.copy.faq} title={labels.faqTitle} />
      <EbookGuarantee text={entry.copy.guarantee} />
      <EbookAiNotice text={entry.copy.aiNotice} />
    </article>
  );
}
