import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { getContentBySlug } from '@/lib/cms/fetch-content';
import { detectLocale } from '@/lib/detect-locale';

export const revalidate = 3600;

const CMS_SLUG = 'terms-of-use';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const headerList  = await headers();
  const locale = detectLocale(cookieStore, headerList.get('accept-language') ?? undefined);
  const post = await getContentBySlug(locale, CMS_SLUG);
  if (post) return { title: post.title, description: post.excerpt ?? undefined };
  return {
    title:       'Termos de Uso',
    description: 'Leia os termos de uso e condições da plataforma Corgly.',
  };
}

const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] as const;

export default async function TermsPage() {
  const cookieStore = await cookies();
  const headerList  = await headers();
  const locale = detectLocale(cookieStore, headerList.get('accept-language') ?? undefined);
  const cmsPost = await getContentBySlug(locale, CMS_SLUG);
  const t = await getTranslations('terms');

  return (
    <div data-testid="page-terms" className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div data-testid="terms-header" className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{cmsPost?.title ?? t('title')}</h1>
          {cmsPost?.publishedAt ? (
            <p className="text-sm text-muted-foreground mt-2">
              {new Date(cmsPost.publishedAt).toLocaleDateString(locale)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">{t('lastUpdated')}</p>
          )}
        </div>

        {cmsPost ? (
          <div className="prose prose-neutral max-w-none" dangerouslySetInnerHTML={{ __html: cmsPost.body }} />
        ) : (
          <div className="prose prose-sm max-w-none space-y-6 text-foreground">
            {SECTIONS.map((key) => (
              <section key={key}>
                <h2 className="text-xl font-semibold mb-3">{t(`${key}Title`)}</h2>
                <p className="text-muted-foreground leading-relaxed">{t(`${key}Text`)}</p>
              </section>
            ))}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-border">
          <Link href={ROUTES.PRIVACY} data-testid="terms-privacy-link" className="text-primary text-sm font-medium hover:underline mr-4">
            {t('linkPrivacy')}
          </Link>
          <Link href={ROUTES.HOME} data-testid="terms-back-link" className="text-muted-foreground text-sm hover:underline">
            &larr; {t('linkBack')}
          </Link>
        </div>
      </div>
    </div>
  );
}
