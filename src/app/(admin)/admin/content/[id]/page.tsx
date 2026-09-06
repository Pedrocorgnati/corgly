import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ContentEditor } from '@/components/admin/ContentEditor';
import { AssetTranscriptionPanel } from '@/components/admin/AssetTranscriptionPanel';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Admin — Editar conteúdo',
};

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await prisma.content.findUnique({
    where:   { id },
    include: {
      translations: true,
      assets: { orderBy: { uploadedAt: 'desc' } },
    },
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
    <PageWrapper data-testid="page-admin-content-detail">
      <div data-testid="admin-content-detail-header" className="mb-6">
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

      <section data-testid="admin-content-detail-assets" className="mt-8" aria-label="Gravações, transcrições e legendas">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Gravações, transcrições e legendas
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Dispare a transcrição de cada gravação, acompanhe o status do job e
          publique as legendas por idioma separadamente.
        </p>
        {content.assets.length === 0 ? (
          <div data-testid="admin-content-detail-assets-empty" className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma gravação vinculada a este conteúdo ainda. Faça o upload de um
            vídeo/áudio para habilitar a transcrição e as legendas.
          </div>
        ) : (
          <div className="space-y-4">
            {content.assets.map((asset) => (
              <div key={asset.id} data-testid={`admin-content-detail-asset-${asset.id}`}>
                <AssetTranscriptionPanel
                  assetId={asset.id}
                  assetLabel={`${asset.originalFilename} (${asset.type})`}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </PageWrapper>
  );
}
