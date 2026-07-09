import 'server-only';
import { prisma } from '@/lib/prisma';
import { localeToSupportedLanguage, type Locale } from '../../../i18n/config';

/**
 * @module lib/library/fetch-library
 * Camada de dados server-only da biblioteca logada (T-060 / ST-32 / ST-33).
 *
 * Resolve conteudo gravado publicado, seus recursos (assets READY), transcript e
 * captions. O `storageKey` cru NUNCA e exposto: cada recurso traz apenas o
 * `downloadPath` que passa pelo gateway assinado de `/assets/:id/download`.
 */

export interface LibraryListItem {
  contentId: string;
  slug: string;
  title: string;
  category: string | null;
  type: 'VIDEO' | 'ARTICLE';
  resourceCount: number;
}

export interface LibraryResource {
  id: string;
  type: string;
  originalFilename: string;
  mimeType: string;
  language: string | null;
  /** Gateway assinado; a URL real de download e emitida sob demanda. */
  downloadPath: string;
}

export interface LibraryCaption {
  id: string;
  language: string;
  format: string;
  /** Conteudo inline (VTT/SRT/TXT) quando disponivel; senao apenas disponibilidade. */
  inlineContent: string | null;
}

export interface LibraryEntry {
  contentId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  type: 'VIDEO' | 'ARTICLE';
  videoId: string;
  transcript: string | null;
  resources: LibraryResource[];
  captions: LibraryCaption[];
}

/** Extrai o id de 11 chars de uma URL do YouTube em qualquer formato comum. */
function extractYouTubeId(url: string | null | undefined): string {
  if (!url) return '';
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/,
  );
  return match ? match[1] : '';
}

/** Lista o catalogo logado: conteudo publicado + contagem de recursos prontos. */
export async function getLibraryItems(locale: string): Promise<LibraryListItem[]> {
  const lang = localeToSupportedLanguage(locale as Locale);
  const rows = await prisma.content.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      category: true,
      type: true,
      translations: {
        where: { locale: lang },
        select: { slug: true, title: true },
        take: 1,
      },
      assets: {
        where: { processingStatus: 'READY' },
        select: { id: true },
      },
    },
  });

  return rows.map((content) => ({
    contentId: content.id,
    slug: content.translations[0]?.slug ?? content.id,
    title: content.translations[0]?.title ?? content.title,
    category: content.category,
    type: content.type,
    resourceCount: content.assets.length,
  }));
}

/**
 * Resolve um conteudo da biblioteca por `slug` (traducao do locale corrente) com
 * fallback para o `id` cru. Retorna null quando inexistente ou nao publicado.
 */
export async function getLibraryEntry(
  locale: string,
  slug: string,
): Promise<LibraryEntry | null> {
  const lang = localeToSupportedLanguage(locale as Locale);

  const translation = await prisma.contentTranslation.findUnique({
    where: { locale_slug: { locale: lang, slug } },
    select: { contentId: true },
  });
  const contentId = translation?.contentId ?? slug;

  const content = await prisma.content.findFirst({
    where: { id: contentId, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      type: true,
      youtubeUrl: true,
      transcript: true,
      translations: {
        where: { locale: lang },
        select: { slug: true, title: true, excerpt: true },
        take: 1,
      },
      assets: {
        where: { processingStatus: 'READY' },
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          type: true,
          originalFilename: true,
          mimeType: true,
          language: true,
          captions: {
            where: { status: 'READY' },
            select: { id: true, language: true, format: true, content: true },
          },
        },
      },
    },
  });
  if (!content) return null;

  const tr = content.translations[0];
  const resources: LibraryResource[] = [];
  const captions: LibraryCaption[] = [];

  for (const asset of content.assets) {
    resources.push({
      id: asset.id,
      type: asset.type,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      language: asset.language,
      downloadPath: `/api/v1/assets/${asset.id}/download`,
    });
    for (const caption of asset.captions) {
      captions.push({
        id: caption.id,
        language: caption.language,
        format: caption.format,
        inlineContent: caption.content ?? null,
      });
    }
  }

  return {
    contentId: content.id,
    slug: tr?.slug ?? content.id,
    title: tr?.title ?? content.title,
    description: tr?.excerpt ?? content.description,
    category: content.category,
    type: content.type,
    videoId: extractYouTubeId(content.youtubeUrl),
    transcript: content.transcript,
    resources,
    captions,
  };
}
