'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Send, UploadCloud, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';

/**
 * Painel admin de transcricao e legendas de um asset (AD-24 / AD-25 / T-059).
 *
 * Cabea o service `transcript-job.service` via as rotas
 * `/api/v1/admin/assets/{id}/transcription` e `/api/v1/admin/assets/{id}/captions`:
 *  - dispara transcricao por idioma (com fallback manual sinalizado),
 *  - mostra status consolidado de jobs (incl. erros recuperaveis),
 *  - publica legendas por idioma separadamente.
 *
 * Trata todos os estados: loading, erro (com retry), vazio e sucesso.
 */

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'PT_BR', label: 'pt-BR' },
  { value: 'EN_US', label: 'en-US' },
  { value: 'ES_ES', label: 'es-ES' },
  { value: 'IT_IT', label: 'it-IT' },
];

const LOCALE_LABEL: Record<string, string> = Object.fromEntries(
  LOCALES.map((l) => [l.value, l.label]),
);

interface JobView {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  finalErrorCode: string | null;
  finalErrorMessage: string | null;
}

interface TranscriptView {
  id: string;
  language: Locale;
  status: string;
  provider: string | null;
  confidence: number | null;
  requiresManualReview: boolean;
  errorMessage: string | null;
}

interface CaptionView {
  id: string;
  language: Locale;
  format: string;
  status: string;
  publicUrl: string | null;
  errorMessage: string | null;
  publishable: boolean;
}

interface TranscriptionStatus {
  assetId: string;
  processingStatus: string;
  processingError: string | null;
  recoverable: boolean;
  jobs: JobView[];
  transcripts: TranscriptView[];
  captions: CaptionView[];
}

interface Envelope<T> {
  data: T | null;
  error: string | null;
  message: string | null;
}

interface Props {
  assetId: string;
  assetLabel: string;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'READY':
      return 'default';
    case 'FAILED':
      return 'destructive';
    case 'PROCESSING':
    case 'PENDING':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function AssetTranscriptionPanel({ assetId, assetLabel }: Props) {
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Locale>('PT_BR');
  const [isDispatching, setIsDispatching] = useState(false);
  const [publishingLang, setPublishingLang] = useState<string | null>(null);

  const base = `/api/v1/admin/assets/${assetId}`;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<Envelope<TranscriptionStatus>>(`${base}/transcription`);
      setStatus(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar transcricao.');
    } finally {
      setIsLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDispatch() {
    setIsDispatching(true);
    try {
      const res = await apiClient.post<Envelope<{ manualFallback: boolean }>>(
        `${base}/transcription`,
        { language, generateCaptions: true },
      );
      if (res.message) {
        if (res.data?.manualFallback) toast.warning(res.message);
        else toast.success(res.message);
      } else {
        toast.success('Transcricao enfileirada.');
      }
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao enfileirar transcricao.');
    } finally {
      setIsDispatching(false);
    }
  }

  async function handlePublish(lang: Locale) {
    setPublishingLang(lang);
    try {
      // Publicar = promover a legenda ja gerada pelo job (storageKey persistido)
      // a READY. Sem reenvio de conteudo: o service reaproveita o artefato.
      await apiClient.post<Envelope<unknown>>(`${base}/captions`, {
        language: lang,
      });
      toast.success(`Legenda ${LOCALE_LABEL[lang] ?? lang} publicada.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao publicar legenda.');
    } finally {
      setPublishingLang(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{assetLabel}</h3>
          {status && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={statusVariant(status.processingStatus)}>
                {status.processingStatus}
              </Badge>
              {status.processingError && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3" />
                  {status.recoverable ? 'Erro recuperavel' : 'Erro fatal'}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={isLoading}
          aria-label="Recarregar status"
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Disparo de transcricao */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Idioma
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Locale)}
            disabled={isDispatching}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void handleDispatch()} disabled={isDispatching} size="sm">
          {isDispatching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {isDispatching ? 'Enfileirando...' : 'Disparar transcricao'}
        </Button>
      </div>

      {/* Estados: loading / erro / sucesso */}
      {isLoading && !status ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="mb-3 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </div>
      ) : status ? (
        <div className="space-y-5">
          {/* Jobs */}
          <section aria-label="Jobs de transcricao">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Jobs
            </h4>
            {status.jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum job disparado ainda.</p>
            ) : (
              <ul className="space-y-1">
                {status.jobs.map((j) => (
                  <li
                    key={j.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                      <span className="text-muted-foreground">
                        tentativa {j.attempts}/{j.maxAttempts}
                      </span>
                    </span>
                    {j.finalErrorMessage && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3" />
                        {j.finalErrorCode ? `${j.finalErrorCode}: ` : ''}
                        {j.finalErrorMessage}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Transcripts */}
          <section aria-label="Transcricoes">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transcricoes
            </h4>
            {status.transcripts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma transcricao disponivel.</p>
            ) : (
              <ul className="space-y-1">
                {status.transcripts.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {LOCALE_LABEL[t.language] ?? t.language}
                      </span>
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                      {t.confidence != null && (
                        <span className="text-muted-foreground">
                          {(t.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                    {t.requiresManualReview && (
                      <Badge variant="outline">Revisao manual</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Captions */}
          <section aria-label="Legendas">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Legendas
            </h4>
            {status.captions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma legenda gerada ainda.</p>
            ) : (
              <ul className="space-y-1">
                {status.captions.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {LOCALE_LABEL[c.language] ?? c.language}
                      </span>
                      <span className="text-muted-foreground">{c.format}</span>
                      <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    </span>
                    {c.status === 'READY' ? (
                      c.publicUrl ? (
                        <a
                          href={c.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          Ver legenda
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Publicada</span>
                      )
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handlePublish(c.language)}
                        disabled={publishingLang === c.language}
                      >
                        {publishingLang === c.language ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UploadCloud className="size-4" />
                        )}
                        Publicar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sem dados de transcricao para este asset.</p>
      )}
    </Card>
  );
}
