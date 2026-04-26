import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listContent } from '@/lib/cms/fetch-content';
import { locales, type Locale } from '../../../../../i18n/config';

export const revalidate = 3600;

interface PageProps {
  params:       Promise<{ locale: Locale }>;
  searchParams: Promise<{ page?: string; category?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!locales.includes(locale)) return {};
  return {
    title:       'Blog — Corgly',
    description: 'Artigos e novidades sobre aprendizado de idiomas na Corgly.',
    alternates:  { canonical: `/blog/${locale}` },
  };
}

export default async function BlogListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!locales.includes(locale)) notFound();

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const pageSize = 10;
  const data = await listContent(locale, { page, pageSize, category: sp.category });
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Blog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.total} {data.total === 1 ? 'post' : 'posts'}
          </p>
        </header>

        {data.items.length === 0 ? (
          <p className="text-muted-foreground">Nenhum post publicado ainda.</p>
        ) : (
          <ul className="space-y-6">
            {data.items.map((post) => (
              <li key={post.id} className="border-b border-border pb-6 last:border-0">
                <Link href={`/blog/${locale}/${post.slug}`} className="group">
                  <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition">
                    {post.title}
                  </h2>
                  {post.publishedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(post.publishedAt).toLocaleDateString(locale)}
                      {post.category && ` · ${post.category}`}
                    </p>
                  )}
                  {post.excerpt && (
                    <p className="text-sm text-muted-foreground mt-2">{post.excerpt}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={`/blog/${locale}?page=${page - 1}`} className="text-primary hover:underline">
                &larr; Anterior
              </Link>
            ) : <span />}
            <span className="text-muted-foreground">Pagina {page} de {totalPages}</span>
            {page < totalPages ? (
              <Link href={`/blog/${locale}?page=${page + 1}`} className="text-primary hover:underline">
                Proxima &rarr;
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
