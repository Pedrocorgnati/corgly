import { z } from 'zod';

/**
 * Domínio de assets, transcripts e captions (§12.4.2 / §12.4.4).
 * Espelha os enums Prisma e separa upload/registro de arquivo das etapas
 * assíncronas de processamento, transcrição e geração de legendas.
 */

export const ASSET_TYPES = ['VIDEO', 'AUDIO', 'DOCUMENT', 'IMAGE', 'OTHER'] as const;
export const ASSET_STORAGE_PROVIDERS = ['LOCAL', 'S3', 'R2', 'VERCEL_BLOB', 'EXTERNAL'] as const;
export const ASSET_PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED'] as const;
export const TRANSCRIPT_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export const CAPTION_FORMATS = ['VTT', 'SRT', 'TXT'] as const;
export const CAPTION_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export const SUPPORTED_LANGUAGES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

export const assetTypeSchema = z.enum(ASSET_TYPES);
export const assetStorageProviderSchema = z.enum(ASSET_STORAGE_PROVIDERS);
export const assetProcessingStatusSchema = z.enum(ASSET_PROCESSING_STATUSES);
export const transcriptStatusSchema = z.enum(TRANSCRIPT_STATUSES);
export const captionFormatSchema = z.enum(CAPTION_FORMATS);
export const captionStatusSchema = z.enum(CAPTION_STATUSES);
export const supportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);

export const assetStorageKeySchema = z
  .string()
  .trim()
  .min(3, 'storageKey muito curto')
  .max(500, 'storageKey excede 500 caracteres')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/@-]*$/, 'storageKey deve usar letras, números, /, @, ponto, hífen ou underscore');

export const assetChecksumSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'SHA-256 inválido');

export const assetFileSchema = z.object({
  originalFilename: z.string().trim().min(1, 'Nome do arquivo obrigatório').max(255),
  mimeType: z.string().trim().min(3, 'MIME type obrigatório').max(120),
  fileSizeBytes: z.coerce.bigint().positive('Arquivo deve ter tamanho positivo'),
  checksumSha256: assetChecksumSchema.optional(),
});

/** Entrada para registrar um arquivo já aceito pelo fluxo de upload assinado. */
export const createAssetSchema = assetFileSchema.extend({
  ownerId: z.string().uuid('ownerId inválido').optional(),
  sessionId: z.string().uuid('sessionId inválido').optional(),
  contentId: z.string().uuid('contentId inválido').optional(),
  type: assetTypeSchema,
  storageProvider: assetStorageProviderSchema.default('LOCAL'),
  storageKey: assetStorageKeySchema,
  publicUrl: z.string().trim().url('URL pública inválida').max(1000).optional(),
  durationSeconds: z.coerce.number().int().positive().optional(),
  language: supportedLanguageSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateAssetProcessingSchema = z
  .object({
    assetId: z.string().uuid('assetId inválido'),
    processingStatus: assetProcessingStatusSchema,
    processingError: z.string().trim().max(4000).optional(),
    processedAt: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.processingStatus === 'FAILED' && !data.processingError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['processingError'],
        message: 'processingError obrigatório quando status é FAILED',
      });
    }
    if (data.processingStatus === 'READY' && !data.processedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['processedAt'],
        message: 'processedAt obrigatório quando status é READY',
      });
    }
  });

export const upsertTranscriptSchema = z
  .object({
    assetId: z.string().uuid('assetId inválido'),
    language: supportedLanguageSchema,
    status: transcriptStatusSchema.default('PENDING'),
    provider: z.string().trim().max(80).optional(),
    rawText: z.string().trim().min(1, 'Transcrição obrigatória'),
    normalizedText: z.string().trim().min(1).optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    startedAt: z.coerce.date().optional(),
    completedAt: z.coerce.date().optional(),
    errorMessage: z.string().trim().max(4000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'FAILED' && !data.errorMessage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['errorMessage'], message: 'errorMessage obrigatório quando status é FAILED' });
    }
    if (data.status === 'READY' && !data.completedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'completedAt obrigatório quando status é READY' });
    }
  });

export const upsertCaptionSchema = z
  .object({
    assetId: z.string().uuid('assetId inválido'),
    transcriptId: z.string().uuid('transcriptId inválido').optional(),
    language: supportedLanguageSchema,
    format: captionFormatSchema,
    status: captionStatusSchema.default('PENDING'),
    storageKey: assetStorageKeySchema.optional(),
    publicUrl: z.string().trim().url('URL pública inválida').max(1000).optional(),
    content: z.string().trim().min(1).optional(),
    generatedAt: z.coerce.date().optional(),
    errorMessage: z.string().trim().max(4000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'READY' && !data.storageKey && !data.content) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storageKey'], message: 'Legenda READY exige storageKey ou content' });
    }
    if (data.status === 'FAILED' && !data.errorMessage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['errorMessage'], message: 'errorMessage obrigatório quando status é FAILED' });
    }
  });

export const assetQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  contentId: z.string().uuid().optional(),
  type: assetTypeSchema.optional(),
  language: supportedLanguageSchema.optional(),
  processingStatus: assetProcessingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AssetType = z.infer<typeof assetTypeSchema>;
export type AssetStorageProvider = z.infer<typeof assetStorageProviderSchema>;
export type AssetProcessingStatus = z.infer<typeof assetProcessingStatusSchema>;
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;
export type CaptionFormat = z.infer<typeof captionFormatSchema>;
export type CaptionStatus = z.infer<typeof captionStatusSchema>;
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetProcessingInput = z.infer<typeof updateAssetProcessingSchema>;
export type UpsertTranscriptInput = z.infer<typeof upsertTranscriptSchema>;
export type UpsertCaptionInput = z.infer<typeof upsertCaptionSchema>;
export type AssetQuery = z.infer<typeof assetQuerySchema>;
