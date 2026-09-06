'use client';

import { useState } from 'react';
import {
  Download,
  Loader2,
  AlertCircle,
  FileText,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  File as FileIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface Resource {
  id: string;
  type: string;
  originalFilename: string;
  mimeType: string;
  language: string | null;
  /** Gateway assinado; a URL real e emitida sob demanda a cada clique. */
  downloadPath: string;
}

interface ContentResourcePanelProps {
  resources: Resource[];
}

type DownloadResponse = { data?: { download?: { url?: string; expiresAt?: string } } };

function iconFor(type: string) {
  switch (type) {
    case 'VIDEO':
      return FileVideo;
    case 'AUDIO':
      return FileAudio;
    case 'DOCUMENT':
      return FileText;
    case 'IMAGE':
      return ImageIcon;
    default:
      return FileIcon;
  }
}

/**
 * ST-33: lista os recursos vinculados a aula. Cada download solicita uma URL
 * assinada FRESCA ao gateway `/assets/:id/download` (TTL 5min). A renovacao
 * acontece sem recarregar a pagina: o clique re-emite a assinatura e, se o link
 * tiver expirado entre a emissao e o uso (410), re-tenta uma vez.
 */
export function ContentResourcePanel({ resources }: ContentResourcePanelProps) {
  const t = useTranslations('library');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function emitSignedUrl(path: string): Promise<string | null> {
    const json = await apiClient.get<DownloadResponse>(path);
    return json.data?.download?.url ?? null;
  }

  async function handleDownload(resource: Resource) {
    setBusyId(resource.id);
    setErrorId(null);
    try {
      let url = await emitSignedUrl(resource.downloadPath);
      if (!url) {
        throw new ApiError('signed url ausente', 0, 'NO_URL');
      }

      // Best-effort: abrir a URL assinada. Se o gateway sinalizar expiracao (410)
      // renova a assinatura e reabre sem recarregar a pagina.
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        // Popup bloqueado: navega na mesma aba como fallback.
        window.location.href = url;
      }
    } catch {
      setErrorId(resource.id);
    } finally {
      setBusyId(null);
    }
  }

  if (resources.length === 0) {
    return (
      <div data-testid="content-resources-empty" className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('resourcesEmpty')}</p>
      </div>
    );
  }

  return (
    <div data-testid="content-resources" className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">{t('resourcesExpiringHint')}</p>
      <ul data-testid="content-resources-list" className="space-y-2">
        {resources.map((resource) => {
          const Icon = iconFor(resource.type);
          const busy = busyId === resource.id;
          const failed = errorId === resource.id;
          return (
            <li
              key={resource.id}
              data-testid={`content-resources-item-${resource.id}`}
              className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
            >
              <Icon className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {resource.originalFilename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resource.language ? `${resource.language} - ` : ''}
                  {resource.mimeType}
                </p>
                {failed && (
                  <p data-testid={`content-resources-item-${resource.id}-error`} className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    {t('resourcesError')}
                  </p>
                )}
              </div>
              <Button
                data-testid={`content-resources-download-${resource.id}-button`}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleDownload(resource)}
                disabled={busy}
                aria-label={t('resourcesDownloadAria', { name: resource.originalFilename })}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                <span className="ml-1.5">{t('resourcesDownload')}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
