import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ContentEditor } from '@/components/admin/ContentEditor';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Admin — Editar conteúdo',
};

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await prisma.content.findUnique({
    where:   { id },
    include: { translations: true },
  });
  if (!content) notFound();

  const emptyT = (locale: Locale) => ({ locale, title: '', slug: '', excerpt: '', body: '' });
  const translations = {
    PT_BR: emptyT('PT_BR'),
    EN_US: emptyT('EN_US'),
    ES_ES: emptyT('ES_ES'),
    IT_IT: emptyT('IT_IT'),
  };
  for (const t of content.translations) {
    translations[t.locale as Locale] = {
      locale:  t.locale as Locale,
      title:   t.title,
      slug:    t.slug,
      excerpt: t.excerpt ?? '',
      body:    t.body,
    };
  }

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Editar — {content.title}</h1>
      </div>
      <ContentEditor initial={{
        id:          content.id,
        type:        content.type,
        title:       content.title,
        category:    content.category ?? '',
        status:      content.status,
        publishedAt: content.publishedAt ? content.publishedAt.toISOString().slice(0, 16) : '',
        youtubeUrl:  content.youtubeUrl ?? '',
        translations,
      }} />
    </PageWrapper>
  );
}
