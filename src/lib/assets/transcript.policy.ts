import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type AssetStorageProvider,
  type CaptionFormat,
} from '@/lib/assets/asset.schema';

/**
 * Política canônica de transcrição e retenção - §12.4.2 / §12.4.4 / §12.4.5.
 *
 * Fonte da verdade das decisões formalizadas em ADR-0005-transcript-provider:
 *  - Provedor: Whisper-class gerenciado como padrão (`openai-whisper`) com
 *    fallback manual SEMPRE disponível (`manual`). O `provider` é `String` no
 *    Prisma, então adicionar provedores futuros NÃO exige migration.
 *  - Fila: runner assíncrono existente (T-057), `JobType.TRANSCRIPTION`, na
 *    fila `transcription`, com retry exponencial e rebaixe a manual.
 *  - Armazenamento: texto no banco (`Transcript.rawText/normalizedText`);
 *    vídeo de origem e captions no mesmo `AssetStorageProvider` do asset.
 *  - Retenção: gravações de sessão por 90 dias depois `ARCHIVED`; conteúdo
 *    publicado indefinido enquanto publicado; transcript/caption seguem o pai.
 *
 * NÃO duplica enums: importa os contratos de `asset.schema.ts` (que por sua vez
 * espelham os enums Prisma de assets). Consumidores: handler `TRANSCRIPTION` do
 * runner, telas AD-24/AD-25 e o job `JobType.CLEANUP`.
 */

// ─── Provedor ───────────────────────────────────────────────────────────────

/** Conjunto de provedores commitado pela ADR-0005. `provider` permanece String no schema. */
export const TRANSCRIPT_PROVIDERS = ['openai-whisper', 'manual'] as const;
export type TranscriptProvider = (typeof TRANSCRIPT_PROVIDERS)[number];

/** Provedor automático padrão (Whisper-class gerenciado). */
export const DEFAULT_TRANSCRIPT_PROVIDER: TranscriptProvider = 'openai-whisper';

/** Fallback garantido: edição/transcrição manual via AD-25. */
export const FALLBACK_TRANSCRIPT_PROVIDER: TranscriptProvider = 'manual';

/** Idiomas que o caminho automático cobre (reusa o enum de assets). */
export const TRANSCRIPT_SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

/** Confiança mínima abaixo da qual o transcript vai para revisão humana. */
export const TRANSCRIPT_MIN_CONFIDENCE = 0.6;

export function isSupportedTranscriptProvider(value: string): value is TranscriptProvider {
  return (TRANSCRIPT_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Normaliza o provedor pedido: usa-o se commitado; senão cai no padrão.
 * `default` (valor default do payload de job) e vazio resolvem ao padrão.
 */
export function resolveTranscriptProvider(requested?: string | null): TranscriptProvider {
  if (!requested || requested.trim() === '' || requested.trim() === 'default') {
    return DEFAULT_TRANSCRIPT_PROVIDER;
  }
  const normalized = requested.trim().toLowerCase();
  return isSupportedTranscriptProvider(normalized) ? normalized : DEFAULT_TRANSCRIPT_PROVIDER;
}

/** Idioma fora do conjunto suportado força o fallback manual. */
export function isTranscribableLanguage(language: string): language is SupportedLanguage {
  return (TRANSCRIPT_SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

/** Confiança ausente ou abaixo do limiar exige revisão humana antes de publicar legenda. */
export function requiresManualReview(confidence?: number | null): boolean {
  if (confidence === null || confidence === undefined) return true;
  return confidence < TRANSCRIPT_MIN_CONFIDENCE;
}

// ─── Fila ───────────────────────────────────────────────────────────────────

/** Nome da fila do runner T-057 para jobs `JobType.TRANSCRIPTION`. */
export const TRANSCRIPT_JOB_QUEUE = 'transcription';

/** Tentativas antes de rebaixar para manual (alinhado ao backoff do runner). */
export const TRANSCRIPT_MAX_ATTEMPTS = 3;

/** Formato de legenda emitido por padrão pelo caminho automático. */
export const DEFAULT_CAPTION_FORMAT: CaptionFormat = 'VTT';

/** Esgotadas as tentativas automáticas, rebaixa para revisão/transcrição manual. */
export function shouldFallbackToManual(attempts: number): boolean {
  return attempts >= TRANSCRIPT_MAX_ATTEMPTS;
}

// ─── Armazenamento ──────────────────────────────────────────────────────────

/**
 * Onde cada artefato de transcrição vive. O texto fica no banco; vídeo e
 * captions seguem o storage provider do asset de origem. A política não
 * introduz provider novo; só fixa a alocação.
 */
export const TRANSCRIPT_STORAGE = {
  /** Texto da transcrição mora no banco (`Transcript.rawText/normalizedText`). */
  transcriptText: 'DATABASE' as const,
  /** Captions seguem o storage do asset de origem (R2/S3 em prod, LOCAL em dev). */
  captionFollowsAsset: true,
} as const;

/** Captions e vídeo herdam o provider de storage do asset de origem. */
export function resolveCaptionStorageProvider(assetProvider: AssetStorageProvider): AssetStorageProvider {
  return assetProvider;
}

// ─── Retenção ───────────────────────────────────────────────────────────────

/** Escopo de retenção derivado de qual relação do `Asset` está preenchida. */
export type AssetRetentionScope = 'SESSION_RECORDING' | 'PUBLISHED_CONTENT';

/** Gravação de sessão: retida 90 dias após upload, depois `ARCHIVED`. */
export const TRANSCRIPT_SESSION_RECORDING_RETENTION_DAYS = 90;

/** Conteúdo publicado: retenção indefinida enquanto publicado (segue o `Content`). */
export const TRANSCRIPT_PUBLISHED_CONTENT_RETENTION_DAYS: number | null = null;

/** Deriva o escopo a partir das relações do asset (sessionId vs contentId). */
export function resolveRetentionScope(asset: {
  sessionId?: string | null;
  contentId?: string | null;
}): AssetRetentionScope {
  return asset.sessionId ? 'SESSION_RECORDING' : 'PUBLISHED_CONTENT';
}

/**
 * Instante de arquivamento do asset de origem.
 * Gravação de sessão: uploadedAt + 90 dias. Conteúdo publicado: `null` (indefinido).
 */
export function computeAssetRetentionDeadline(
  uploadedAt: Date,
  scope: AssetRetentionScope,
): Date | null {
  if (scope === 'PUBLISHED_CONTENT') return null;
  const deadline = new Date(uploadedAt.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + TRANSCRIPT_SESSION_RECORDING_RETENTION_DAYS);
  return deadline;
}

/** Consumido pelo job `CLEANUP`: asset expirado deve ser arquivado/purgado. */
export function shouldPurgeAsset(now: Date, deadline: Date | null): boolean {
  if (deadline === null) return false;
  return now.getTime() >= deadline.getTime();
}

/**
 * Resumo executável da decisão (espelha a tabela da ADR-0005).
 * Usado por testes e telas admin para exibir a política vigente.
 */
export const TRANSCRIPT_POLICY = {
  defaultProvider: DEFAULT_TRANSCRIPT_PROVIDER,
  fallbackProvider: FALLBACK_TRANSCRIPT_PROVIDER,
  providers: TRANSCRIPT_PROVIDERS,
  supportedLanguages: TRANSCRIPT_SUPPORTED_LANGUAGES,
  minConfidence: TRANSCRIPT_MIN_CONFIDENCE,
  queue: TRANSCRIPT_JOB_QUEUE,
  maxAttempts: TRANSCRIPT_MAX_ATTEMPTS,
  defaultCaptionFormat: DEFAULT_CAPTION_FORMAT,
  sessionRecordingRetentionDays: TRANSCRIPT_SESSION_RECORDING_RETENTION_DAYS,
  publishedContentRetentionDays: TRANSCRIPT_PUBLISHED_CONTENT_RETENTION_DAYS,
} as const;
