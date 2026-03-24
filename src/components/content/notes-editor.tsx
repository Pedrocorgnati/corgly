'use client';
import { API } from '@/lib/constants/routes';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Save, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/lib/constants/routes';
import { apiClient } from '@/lib/api-client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface NotesEditorProps {
  contentId: string;
  isAuthenticated: boolean;
}

export function NotesEditor({ contentId, isAuthenticated }: NotesEditorProps) {
  const t = useTranslations('content');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  // Load existing notes on mount
  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadNotes() {
      try {
        const json = await apiClient.get<{ data: { content: string } }>(API.CONTENT_NOTES(contentId));
        if (json.data?.content) {
          setNotes(json.data.content);
        }
      } catch {
        // Silently fail on load — user can still type
      } finally {
        isInitialLoad.current = false;
      }
    }

    loadNotes();
  }, [contentId, isAuthenticated]);

  const saveNotes = useCallback(
    async (value: string) => {
      setStatus('saving');
      try {
        await apiClient.put(API.CONTENT_NOTES(contentId), { content: value });
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    },
    [contentId],
  );

  const handleChange = (value: string) => {
    setNotes(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      saveNotes(value);
    }, 1000);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground mb-4">{t('notesLoginCta')}</p>
        <Link
          href={ROUTES.REGISTER}
          className={buttonVariants({ variant: 'default', size: 'sm' })}
        >
          {t('notesRegisterButton')}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t('notesTitle')}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {status === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t('notesSaving')}</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span>{t('notesSaved')}</span>
            </>
          )}
          {status === 'error' && (
            <span className="text-destructive">{t('notesError')}</span>
          )}
          {status === 'idle' && (
            <>
              <Save className="h-3.5 w-3.5" />
              <span>{t('notesAutoSave')}</span>
            </>
          )}
        </div>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('notesPlaceholder')}
        maxLength={5000}
        className="min-h-[160px] resize-y"
        aria-label={t('notesTitle')}
      />
    </div>
  );
}
