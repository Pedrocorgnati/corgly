import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildVideoObjectSchema } from '@/lib/seo/json-ld';
import { VideoPlayer } from '@/components/content/video-player';
import { NotesEditor } from '@/components/content/notes-editor';
import { Badge } from '@/components/ui/badge';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://corgly.app';

// Placeholder content data for MVP — same source as listing page
const CONTENT_MAP: Record<
  string,
  {
    title: string;
    description: string;
    videoId: string;
    category: string;
    duration: string;
  }
> = {
  'greetings-intro': {
    title: 'Cumprimentos em Português — Como se Apresentar',
    description:
      'Nesta aula você vai aprender as formas mais comuns de cumprimentar e se apresentar em português brasileiro, incluindo expressões informais e formais.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Gramática',
    duration: '12 min',
  },
  'verb-ser-estar': {
    title: 'Ser vs Estar — Quando Usar Cada Um',
    description:
      'Entenda a diferença entre "ser" e "estar", um dos maiores desafios para estudantes de português. Exemplos práticos e regras claras.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Gramática',
    duration: '18 min',
  },
  'daily-routine-vocab': {
    title: 'Vocabulário do Dia a Dia — Rotina',
    description:
      'Aprenda as palavras e expressões mais usadas no cotidiano brasileiro, desde acordar até dormir.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Vocabulário',
    duration: '10 min',
  },
  'pronunciation-nasal': {
    title: 'Pronúncia — Sons Nasais do Português',
    description:
      'Domine os sons nasais do português brasileiro: ã, ão, em, nh e outros. Exercícios práticos de pronúncia.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Pronúncia',
    duration: '15 min',
  },
  'ordering-food': {
    title: 'Conversação — Pedindo Comida no Restaurante',
    description:
      'Pratique situações reais de restaurante: como pedir, perguntar sobre ingredientes e pagar a conta.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Conversação',
    duration: '14 min',
  },
  'past-tense-basics': {
    title: 'Pretérito Perfeito — Introdução ao Passado',
    description:
      'Aprenda a conjugar os verbos regulares no pretérito perfeito e a contar experiências passadas.',
    videoId: 'dQw4w9WgXcQ',
    category: 'Gramática',
    duration: '20 min',
  },
};

// Pre-generate all known content pages at build time
export async function generateStaticParams() {
  return Object.keys(CONTENT_MAP).map((id) => ({ id }));
}

// 404 for slugs not in the map — no on-demand generation
export const dynamicParams = false;

// Static forever — content is hardcoded
export const revalidate = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const content = CONTENT_MAP[id];

  if (!content) {
    return {
      title: 'Conteúdo não encontrado',
      robots: { index: false },
    };
  }

  const url = `${SITE_URL}/content/${id}`;

  return {
    title: content.title,
    description: content.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: content.title,
      description: content.description,
      type: 'video.other',
      url,
      images: ['/opengraph-image'],
      videos: [
        {
          url: `https://www.youtube.com/embed/${content.videoId}`,
          width: 1280,
          height: 720,
          type: 'text/html',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.title,
      description: content.description,
      images: ['/opengraph-image'],
    },
  };
}

export default async function ContentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const content = CONTENT_MAP[id];

  if (!content) {
    notFound();
  }

  // Build JSON-LD schema for this video
  const videoSchema = buildVideoObjectSchema({
    ...content,
    contentId: id,
  });

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <JsonLd schemas={[videoSchema]} />

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Video Player */}
        <VideoPlayer videoId={content.videoId} title={content.title} />

        {/* Content Info */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Badge variant="secondary">{content.category}</Badge>
            <span className="text-sm text-muted-foreground">{content.duration}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {content.title}
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {content.description}
          </p>
        </div>

        {/* Notes Editor — unauthenticated for now (MVP) */}
        <NotesEditor contentId={id} isAuthenticated={false} />
      </div>
    </div>
  );
}
