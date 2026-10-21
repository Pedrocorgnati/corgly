import type { EbookCatalogEntry } from '@/lib/ebooks/schema';

import { ebookAppLocale } from './locale';

type EbookPriceInput = Pick<EbookCatalogEntry, 'unitAmount' | 'currency' | 'locale'>;

export function formatEbookPrice(entry: EbookPriceInput): string {
  return new Intl.NumberFormat(ebookAppLocale(entry.locale), {
    style: 'currency',
    currency: entry.currency.toUpperCase(),
  }).format(entry.unitAmount / 100);
}

export function EbookPrice({ entry, label }: { entry: EbookPriceInput; label: string }) {
  return (
    <div data-testid="ebook-price" className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span data-testid="ebook-price-value" className="text-2xl font-semibold text-foreground">
        {formatEbookPrice(entry)}
      </span>
    </div>
  );
}
