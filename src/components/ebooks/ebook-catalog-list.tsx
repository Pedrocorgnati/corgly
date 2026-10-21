import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button-variants';
import { ROUTES } from '@/lib/constants/routes';
import type { EbookCatalogEntry } from '@/lib/ebooks/schema';
import { cn } from '@/lib/utils';

import { EbookCatalogCard } from './ebook-catalog-card';

export function EbookCatalogList({
  entries,
  labels,
}: {
  entries: readonly EbookCatalogEntry[];
  labels: { viewEbook: string; empty: string; emptyCta: string };
}) {
  // Estado vazio explicito: sem ebook o texto e o link para a home aparecem.
  if (entries.length === 0) {
    return (
      <div
        data-testid="ebook-catalog-empty"
        className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6"
      >
        <p className="text-base text-muted-foreground">{labels.empty}</p>
        <Link
          data-testid="ebook-catalog-empty-home-link"
          href={ROUTES.HOME}
          className={cn(buttonVariants())}
        >
          {labels.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <ul data-testid="ebook-catalog-list" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.slug} className="h-full">
          <EbookCatalogCard entry={entry} viewLabel={labels.viewEbook} />
        </li>
      ))}
    </ul>
  );
}
