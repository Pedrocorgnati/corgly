'use client';

import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export function ContentPreviewSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-20 bg-surface" aria-labelledby="content-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 text-center">
        <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">
          {t('content_preview.badge')}
        </Badge>
        <h2 id="content-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          {t('content_preview.title')}
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          {t('content_preview.subtitle')}
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PlayCircle className="h-5 w-5 text-primary" />
          </div>
          <Link href={ROUTES.CONTENT}>
            <Button variant="outline">{t('content_preview.cta')}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
