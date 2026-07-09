import type { Caption, Job, Transcript } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { createJob } from '@/lib/jobs/job.service';
import {
  upsertCaptionSchema,
  upsertTranscriptSchema,
  type SupportedLanguage,
  type UpsertCaptionInput,
  type UpsertTranscriptInput,
} from '@/lib/assets/asset.schema';
import {
  DEFAULT_CAPTION_FORMAT,
  TRANSCRIPT_JOB_QUEUE,
  TRANSCRIPT_MAX_ATTEMPTS,
  isTranscribableLanguage,
  requiresManualReview,
  resolveTranscriptProvider,
  shouldFallbackToManual,
} from '@/lib/assets/transcript.policy';

/**
 * Serviço de orquestração de transcrição e legendas (T-059 / AD-24 / AD-25).
 *
 * Costura três peças já existentes do domínio:
 *  - `job.service`  -> enfileira `JobType.TRANSCRIPTION` na fila `transcription`
 *    consumida pelo runner assíncrono (T-057).
 *  - `transcript.policy` -> decisões canônicas de provedor, fila, retry,
 *    confiança mínima e fallback manual (ADR-0005).
 *  - `asset.schema` -> validação de upsert de `Transcript` e `Caption`.
 *
 * Responsabilidades (na borda admin AD-24/AD-25):
 *  1. `dispatchTranscriptionJob` - admin dispara a transcrição de um asset.
 *  2. `getTranscriptionJobStatus` - estado consolidado para a UI (job + transcript
 *     + captions), incluindo erros recuperáveis e flag de revisão manual.
 *  3. `recordTranscriptResult` / `failTranscript` - o runner persiste o desfecho.
 *  4. `publishCaption` - publica legenda por idioma separadamente (READY).
 *
 * NÃO duplica enums nem políticas: importa tudo de `asset.schema`/`transcript.policy`.
 */

export class TranscriptJobError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable = true) {
    super(message);
    this.name = 'TranscriptJobError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export interface DispatchTranscriptionInput {
  assetId: string;
  language: SupportedLanguage;
  /** Provedor pedido; `undefined`/`default`/vazio cai no padrão da policy. */
  provider?: string | null;
  generateCaptions?: boolean;
  /** Admin que disparou o job (auditoria; opcional). */
  requestedById?: string;
  /** Prioridade do job na fila (0..100). */
  priority?: number;
}

export interface DispatchTranscriptionResult {
  job: Job;
  provider: string;
  /** Idioma fora do conjunto automático: o caminho cai para revisão manual. */
  manualFallback: boolean;
}

/**
 * Enfileira a transcrição de um asset de vídeo/áudio.
 *
 * Marca o asset como `PROCESSING` e cria o `Job` na fila canônica. Idioma fora
 * do conjunto suportado ainda enfileira (o runner rebaixa para `manual`), mas o
 * resultado sinaliza `manualFallback` para a UI orientar o operador.
 */
export async function dispatchTranscriptionJob(
  input: DispatchTranscriptionInput,
): Promise<DispatchTranscriptionResult> {
  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) {
    throw new TranscriptJobError('ASSET_NOT_FOUND', `Asset ${input.assetId} inexistente`, false);
  }
  if (asset.processingStatus === 'ARCHIVED') {
    throw new TranscriptJobError(
      'ASSET_ARCHIVED',
      'Asset arquivado não pode ser transcrito',
      false,
    );
  }

  const provider = resolveTranscriptProvider(input.provider);
  const manualFallback = !isTranscribableLanguage(input.language);
  const generateCaptions = input.generateCaptions ?? true;

  const job = await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: asset.id },
      data: { processingStatus: 'PROCESSING', processingError: null },
    });

    return createJob({
      type: 'TRANSCRIPTION',
      queueName: TRANSCRIPT_JOB_QUEUE,
      payload: {
        assetId: asset.id,
        language: input.language,
        provider,
        generateCaptions,
      },
      priority: input.priority ?? 0,
      maxAttempts: TRANSCRIPT_MAX_ATTEMPTS,
      createdById: input.requestedById,
    });
  });

  return { job, provider, manualFallback };
}

export interface CaptionStatusView {
  id: string;
  language: SupportedLanguage;
  format: Caption['format'];
  status: Caption['status'];
  publicUrl: string | null;
  errorMessage: string | null;
  /** Legenda pronta e publicável separadamente por idioma. */
  publishable: boolean;
}

export interface TranscriptStatusView {
  id: string;
  language: SupportedLanguage;
  status: Transcript['status'];
  provider: string | null;
  confidence: number | null;
  /** Confiança ausente/baixa: exige revisão humana antes de publicar legenda. */
  requiresManualReview: boolean;
  errorMessage: string | null;
}

export interface TranscriptionJobStatus {
  assetId: string;
  processingStatus: string;
  processingError: string | null;
  /** Erro do asset é recuperável quando ainda há tentativas na fila. */
  recoverable: boolean;
  jobs: Array<Pick<Job, 'id' | 'status' | 'attempts' | 'maxAttempts' | 'finalErrorCode' | 'finalErrorMessage'>>;
  transcripts: TranscriptStatusView[];
  captions: CaptionStatusView[];
}

/**
 * Estado consolidado de transcrição de um asset para a UI admin.
 * Reúne o status do asset, os jobs `TRANSCRIPTION`, e os transcripts/captions
 * derivados, expondo recuperabilidade e necessidade de revisão manual.
 */
export async function getTranscriptionJobStatus(assetId: string): Promise<TranscriptionJobStatus> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      transcripts: { orderBy: { language: 'asc' } },
      captions: { orderBy: [{ language: 'asc' }, { format: 'asc' }] },
    },
  });
  if (!asset) {
    throw new TranscriptJobError('ASSET_NOT_FOUND', `Asset ${assetId} inexistente`, false);
  }

  const jobs = await prisma.job.findMany({
    where: { type: 'TRANSCRIPTION', payload: { path: '$.assetId', equals: assetId } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const failedJob = jobs.find((j) => j.status === 'FAILED');
  const recoverable =
    asset.processingStatus !== 'FAILED' ||
    !failedJob ||
    !shouldFallbackToManual(failedJob.attempts);

  return {
    assetId: asset.id,
    processingStatus: asset.processingStatus,
    processingError: asset.processingError,
    recoverable,
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      finalErrorCode: j.finalErrorCode,
      finalErrorMessage: j.finalErrorMessage,
    })),
    transcripts: asset.transcripts.map((t) => ({
      id: t.id,
      language: t.language as SupportedLanguage,
      status: t.status,
      provider: t.provider,
      confidence: t.confidence,
      requiresManualReview: requiresManualReview(t.confidence),
      errorMessage: t.errorMessage,
    })),
    captions: asset.captions.map((c) => ({
      id: c.id,
      language: c.language as SupportedLanguage,
      format: c.format,
      status: c.status,
      publicUrl: c.publicUrl,
      errorMessage: c.errorMessage,
      publishable: c.status === 'READY',
    })),
  };
}

/**
 * Persiste o resultado de uma transcrição (chamado pelo runner ao concluir).
 * Faz upsert idempotente por `(assetId, language)` e marca o asset `READY`.
 */
export async function recordTranscriptResult(input: UpsertTranscriptInput): Promise<Transcript> {
  const data = upsertTranscriptSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const transcript = await tx.transcript.upsert({
      where: { assetId_language: { assetId: data.assetId, language: data.language } },
      create: {
        assetId: data.assetId,
        language: data.language,
        status: data.status,
        provider: data.provider,
        rawText: data.rawText,
        normalizedText: data.normalizedText,
        confidence: data.confidence,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        errorMessage: data.errorMessage,
        metadata: data.metadata as never,
      },
      update: {
        status: data.status,
        provider: data.provider,
        rawText: data.rawText,
        normalizedText: data.normalizedText,
        confidence: data.confidence,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        errorMessage: data.errorMessage,
        metadata: data.metadata as never,
      },
    });

    if (data.status === 'READY') {
      await tx.asset.update({
        where: { id: data.assetId },
        data: { processingStatus: 'READY', processedAt: data.completedAt ?? new Date(), processingError: null },
      });
    }

    return transcript;
  });
}

/**
 * Marca a transcrição de um asset como `FAILED` com erro recuperável e propaga
 * o erro para o asset. Não apaga o transcript anterior bem-sucedido (idempotente
 * por idioma); cria/atualiza o registro do idioma alvo apenas.
 */
export async function failTranscript(params: {
  assetId: string;
  language: SupportedLanguage;
  errorMessage: string;
  provider?: string;
}): Promise<Transcript> {
  return recordTranscriptResult({
    assetId: params.assetId,
    language: params.language,
    status: 'FAILED',
    provider: params.provider,
    rawText: '[transcrição falhou]',
    errorMessage: params.errorMessage,
  }).then(async (transcript) => {
    await prisma.asset.update({
      where: { id: params.assetId },
      data: { processingStatus: 'FAILED', processingError: params.errorMessage },
    });
    return transcript;
  });
}

/**
 * Upsert de uma legenda por idioma/formato (idempotente por
 * `(assetId, language, format)`). Não publica por si só; usa o status do input.
 */
export async function upsertCaption(input: UpsertCaptionInput): Promise<Caption> {
  const data = upsertCaptionSchema.parse(input);

  return prisma.caption.upsert({
    where: {
      assetId_language_format: {
        assetId: data.assetId,
        language: data.language,
        format: data.format,
      },
    },
    create: {
      assetId: data.assetId,
      transcriptId: data.transcriptId,
      language: data.language,
      format: data.format,
      status: data.status,
      storageKey: data.storageKey,
      publicUrl: data.publicUrl,
      content: data.content,
      generatedAt: data.generatedAt,
      errorMessage: data.errorMessage,
      metadata: data.metadata as never,
    },
    update: {
      transcriptId: data.transcriptId,
      status: data.status,
      storageKey: data.storageKey,
      publicUrl: data.publicUrl,
      content: data.content,
      generatedAt: data.generatedAt,
      errorMessage: data.errorMessage,
      metadata: data.metadata as never,
    },
  });
}

/**
 * Publica (READY) uma legenda específica por idioma, separada das demais.
 *
 * Publicar é uma transição de estado sobre a legenda JÁ gerada pelo job: quando
 * o operador não reenvia `storageKey`/`content`, reaproveitamos o artefato já
 * persistido na `Caption` daquele idioma/formato. Reenviar `storageKey`/`content`
 * continua suportado (re-publicação com artefato novo). Bloqueia publicação se o
 * transcript de origem ainda exige revisão manual ou se não há legenda gerada.
 */
export async function publishCaption(params: {
  assetId: string;
  language: SupportedLanguage;
  format?: Caption['format'];
  storageKey?: string;
  publicUrl?: string;
  content?: string;
}): Promise<Caption> {
  const transcript = await prisma.transcript.findUnique({
    where: { assetId_language: { assetId: params.assetId, language: params.language } },
  });
  if (!transcript) {
    throw new TranscriptJobError(
      'TRANSCRIPT_NOT_FOUND',
      `Sem transcrição ${params.language} para o asset ${params.assetId}`,
      false,
    );
  }
  if (transcript.status !== 'READY') {
    throw new TranscriptJobError(
      'TRANSCRIPT_NOT_READY',
      'Transcrição precisa estar READY antes de publicar a legenda',
    );
  }
  if (requiresManualReview(transcript.confidence)) {
    throw new TranscriptJobError(
      'MANUAL_REVIEW_REQUIRED',
      'Confiança abaixo do limiar: revise a transcrição antes de publicar a legenda',
    );
  }

  const format = params.format ?? DEFAULT_CAPTION_FORMAT;
  let storageKey = params.storageKey || undefined;
  let content = params.content || undefined;
  let publicUrl = params.publicUrl || undefined;

  // Sem artefato reenviado: promover a legenda já gerada pelo job a READY.
  if (!storageKey && !content) {
    const existing = await prisma.caption.findUnique({
      where: { assetId_language_format: { assetId: params.assetId, language: params.language, format } },
    });
    if (!existing || (!existing.storageKey && !existing.content)) {
      throw new TranscriptJobError(
        'CAPTION_NOT_GENERATED',
        `Sem legenda ${params.language} (${format}) gerada para publicar; gere a legenda antes (storageKey/content ausentes)`,
        false,
      );
    }
    storageKey = existing.storageKey || undefined;
    content = existing.content || undefined;
    publicUrl = publicUrl ?? (existing.publicUrl || undefined);
  }

  return upsertCaption({
    assetId: params.assetId,
    transcriptId: transcript.id,
    language: params.language,
    format,
    status: 'READY',
    storageKey,
    publicUrl,
    content,
    generatedAt: new Date(),
  });
}
