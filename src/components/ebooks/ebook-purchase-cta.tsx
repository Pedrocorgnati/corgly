import type { EbookCatalogEntry } from '@/lib/ebooks/schema';

import { EbookBuyButton, type EbookBuyButtonProps } from './ebook-buy-button';
import { EbookPrice } from './ebook-price';

export function EbookPurchaseCta({
  entry,
  priceLabel,
  buyButton,
}: {
  entry: EbookCatalogEntry;
  priceLabel: string;
  buyButton: Omit<EbookBuyButtonProps, 'slug' | 'checkoutUnavailable' | 'checkoutFailed'>;
}) {
  return (
    <section
      data-testid="ebook-purchase-cta"
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8"
    >
      <EbookPrice entry={entry} label={priceLabel} />
      <EbookBuyButton
        slug={entry.slug}
        labels={buyButton.labels}
        errors={buyButton.errors}
        checkoutUnavailable={entry.copy.errors.checkoutUnavailable}
        checkoutFailed={entry.copy.errors.checkoutFailed}
      />
    </section>
  );
}
