'use client';

import { useTranslations } from 'next-intl';

interface VideoPlayerProps {
  videoId: string;
  title: string;
}

export function VideoPlayer({ videoId, title }: VideoPlayerProps) {
  const t = useTranslations('content');

  if (!videoId) {
    return (
      <div className="w-full rounded-2xl bg-muted flex items-center justify-center aspect-video">
        <p className="text-muted-foreground">{t('videoUnavailable')}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="w-full aspect-video"
      />
    </div>
  );
}
