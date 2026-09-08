'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, FileText, Lock, SearchX, NotebookText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ReadOnlyNotesViewerProps {
  state: 'loading' | 'ok' | 'empty' | 'error';
  plainText?: string;
  updatedAt?: Date;
  errorKind?: 'forbidden' | 'not_found' | 'server';
  'data-testid'?: string;
}

// Ate 2026-09-07 o formatador estava cravado em 'pt-BR' no escopo do modulo e a
// data saia em portugues mesmo com o aluno em outro idioma.
function formatUpdatedAt(updatedAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(updatedAt));
}

/**
 * Visualizador read-only do caderno pos-aula. Cobre os 4 estados exigidos pela
 * regra Zero Estados Indefinidos: loading, ok, empty e error (forbidden/not_found/server).
 * Nenhum controle de edicao e renderizado em qualquer estado.
 */
export function ReadOnlyNotesViewer({
  state,
  plainText,
  updatedAt,
  errorKind,
  'data-testid': testId,
}: ReadOnlyNotesViewerProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = useTranslations('sessionRoom.notes');
  const locale = useLocale();
  const router = useRouter();

  if (state === 'loading') {
    return (
      <div data-testid={testId} className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">{t('loading')}</span>
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="space-y-3 rounded-xl border border-border p-5">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-11/12 rounded bg-muted" />
          <div className="h-4 w-10/12 rounded bg-muted" />
          <div className="h-4 w-9/12 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
        <NotebookText className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground max-w-sm">
          {t('empty')}
        </p>
      </div>
    );
  }

  if (state === 'error') {
    const kind = errorKind ?? 'server';

    if (kind === 'forbidden') {
      return (
        <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-12 text-center">
          <Lock className="h-9 w-9 text-destructive" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">{t('forbiddenTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t('forbiddenDesc')}
          </p>
        </div>
      );
    }

    if (kind === 'not_found') {
      return (
        <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-12 text-center">
          <SearchX className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">{t('notFoundTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t('notFoundDesc')}
          </p>
        </div>
      );
    }

    return (
      <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-12 text-center">
        <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">{t('errorTitle')}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t('errorDesc')}
        </p>
        <Button onClick={() => router.refresh()}>{t('retry')}</Button>
      </div>
    );
  }

  // state === 'ok'
  return (
    <article data-testid={testId} className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('header')}
        </div>
        {updatedAt ? (
          <time
            dateTime={new Date(updatedAt).toISOString()}
            className="text-xs text-muted-foreground"
          >
            {t('updatedAt', { date: formatUpdatedAt(updatedAt, locale) })}
          </time>
        ) : null}
      </header>
      <div className="px-5 py-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {plainText}
        </p>
      </div>
    </article>
  );
}
