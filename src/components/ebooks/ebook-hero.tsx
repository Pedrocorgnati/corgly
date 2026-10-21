import Image from 'next/image';

import type { EbookCatalogEntry } from '@/lib/ebooks/schema';

export function EbookHero({ entry }: { entry: EbookCatalogEntry }) {
  const cover = entry.images.cover;

  return (
    <section
      data-testid="ebook-hero"
      className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-2"
    >
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{entry.copy.title}</h1>
        <p className="text-base text-muted-foreground sm:text-lg">{entry.copy.promise}</p>
      </div>
      <Image
        src={cover.src}
        width={cover.width}
        height={cover.height}
        alt={cover.alt}
        priority
        className="h-auto w-full rounded-xl border border-border object-cover"
      />
    </section>
  );
}
