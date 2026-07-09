import type { Metadata } from 'next';
import Link from 'next/link';
import { Library, Paperclip, Video, FileText } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getLibraryItems, type LibraryListItem } from '@/lib/library/fetch-library';
import { PageWrapper } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Conteudo gravado depende do estudante autenticado + dados publicados ao vivo.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('library');
  return {
    title: t('pageTitle'),
    robots: { index: false },
  };
}

async function loadItems(): Promise<LibraryListItem[]> {
  const locale = await getLocale();
  try {
    return await getLibraryItems(locale);
  } catch {
    // Zero Estados Indefinidos: falha de leitura cai no empty-state renderizavel.
    return [];
  }
}

export default async function LibraryPage() {
  const t = await getTranslations('library');
  const items = await loadItems();

  return (
    <PageWrapper className="max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Library className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('pageDescription')}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Library className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.type === 'VIDEO' ? Video : FileText;
            return (
              <li key={item.contentId}>
                <Link
                  href={`/library/${item.slug}`}
                  className={cn(
                    'group flex h-full flex-col rounded-2xl border border-border bg-card p-5',
                    'transition-shadow duration-200 hover:shadow-lg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                    {item.category && (
                      <Badge variant="secondary" className="text-xs">
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <h2 className="flex-1 text-base font-semibold text-foreground group-hover:text-primary">
                    {item.title}
                  </h2>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    <span>{t('resourceCount', { count: item.resourceCount })}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageWrapper>
  );
}
