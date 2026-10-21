import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button-variants';
import { ROUTES } from '@/lib/constants/routes';
import type { EbookCatalogEntry } from '@/lib/ebooks/schema';
import { cn } from '@/lib/utils';

export function EbookCatalogCard({
  entry,
  viewLabel,
}: {
  entry: EbookCatalogEntry;
  viewLabel: string;
}) {
  return (
    <article
      data-testid={`ebook-catalog-card-${entry.slug}`}
      lang={entry.locale}
      className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6"
    >
      <h2 className="text-xl font-semibold text-foreground">{entry.copy.title}</h2>
      <p className="flex-1 text-base text-muted-foreground">{entry.copy.promise}</p>
      <Link
        data-testid={`ebook-catalog-card-link-${entry.slug}`}
        href={ROUTES.EBOOK_DETAIL(entry.slug)}
        className={cn(buttonVariants({ variant: 'outline' }))}
      >
        {viewLabel}
      </Link>
    </article>
  );
}
