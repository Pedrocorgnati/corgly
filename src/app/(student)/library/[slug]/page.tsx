import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Captions, FileText } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getLibraryEntry } from '@/lib/library/fetch-library';
import { PageWrapper } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { VideoPlayer } from '@/components/content/video-player';
import { NotesEditor } from '@/components/content/notes-editor';
import { ContentResourcePanel } from '@/components/content/ContentResourcePanel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const entry = await getLibraryEntry(locale, slug);
  if (!entry) {
    const t = await getTranslations('library');
    return { title: t('notFoundTitle'), robots: { index: false } };
  }
  return { title: entry.title, robots: { index: false } };
}

export default async function LibraryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations('library');

  let entry;
  try {
    entry = await getLibraryEntry(locale, slug);
  } catch {
    entry = null;
  }
  if (!entry) {
    notFound();
  }

  return (
    <PageWrapper data-testid="page-library-detail" className="max-w-4xl">
      <Link
        href="/library"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToLibrary')}
      </Link>

      <div className="space-y-8">
        {/* Player (apenas quando ha video associado) */}
        {entry.videoId && (
          <div data-testid="library-detail-player">
            <VideoPlayer videoId={entry.videoId} title={entry.title} />
          </div>
        )}

        {/* Cabecalho */}
        <div data-testid="library-detail-header">
          {entry.category && (
            <Badge variant="secondary" className="mb-3">
              {entry.category}
            </Badge>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">{entry.title}</h1>
          {entry.description && (
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {entry.description}
            </p>
          )}
        </div>

        {/* Transcript */}
        <section data-testid="library-detail-transcript" aria-labelledby="library-transcript-title" className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden />
            <h2 id="library-transcript-title" className="text-sm font-semibold text-foreground">
              {t('transcriptTitle')}
            </h2>
          </div>
          {entry.transcript ? (
            <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {entry.transcript}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('transcriptEmpty')}</p>
          )}
        </section>

        {/* Captions */}
        <section data-testid="library-detail-captions" aria-labelledby="library-captions-title" className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Captions className="h-4 w-4 text-primary" aria-hidden />
            <h2 id="library-captions-title" className="text-sm font-semibold text-foreground">
              {t('captionsTitle')}
            </h2>
          </div>
          {entry.captions.length > 0 ? (
            <ul className="space-y-3">
              {entry.captions.map((caption) => (
                <li key={caption.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs uppercase">
                      {caption.language}
                    </Badge>
                    <span className="text-xs text-muted-foreground uppercase">{caption.format}</span>
                  </div>
                  {caption.inlineContent && (
                    <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {caption.inlineContent}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('captionsEmpty')}</p>
          )}
        </section>

        {/* Recursos da aula (ST-33) com URLs assinadas renovadas sob demanda */}
        <section data-testid="library-detail-resources" aria-labelledby="library-resources-title">
          <h2 id="library-resources-title" className="mb-3 text-sm font-semibold text-foreground">
            {t('resourcesTitle')}
          </h2>
          <ContentResourcePanel resources={entry.resources} />
        </section>

        {/* Notas pessoais (autenticadas) */}
        <div data-testid="library-detail-notes">
          <NotesEditor contentId={entry.contentId} isAuthenticated />
        </div>
      </div>
    </PageWrapper>
  );
}
