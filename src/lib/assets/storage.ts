import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import type { AssetType, AssetStorageProvider } from '@/lib/assets/asset.schema';

/**
 * Camada de armazenamento provider-agnóstica para assets (T-058 / §12.4).
 *
 * O fluxo canônico é "signed URL primeiro": o cliente nunca fala direto com o
 * provider de storage. Quem registra o arquivo recebe uma URL PUT pré-assinada
 * (curta expiração) e quem baixa recebe uma URL GET assinada que carrega owner,
 * intenção e expiração no próprio token HMAC - stateless, sem sessão de servidor.
 *
 * Provider LOCAL (default do schema) usa o próprio app como gateway de upload e
 * download; os mesmos tokens valem para S3/R2/VERCEL_BLOB quando o provider real
 * for plugado (basta o emissor trocar `buildProviderUrl`).
 */

/** Limite de tamanho por tipo de asset (bytes). */
export const MAX_UPLOAD_BYTES_BY_TYPE: Record<AssetType, number> = {
  VIDEO: 2 * 1024 * 1024 * 1024, // 2 GiB
  AUDIO: 512 * 1024 * 1024, // 512 MiB
  DOCUMENT: 50 * 1024 * 1024, // 50 MiB
  IMAGE: 25 * 1024 * 1024, // 25 MiB
  OTHER: 25 * 1024 * 1024, // 25 MiB
};

/** MIME types aceitos por tipo de asset. */
export const ALLOWED_MIME_BY_TYPE: Record<AssetType, readonly string[]> = {
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm'],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
  ],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'],
  OTHER: ['application/octet-stream', 'application/zip'],
};

/** Tempo de vida default das URLs assinadas (segundos). */
export const DEFAULT_UPLOAD_TTL_SECONDS = 15 * 60; // 15 min
export const DEFAULT_DOWNLOAD_TTL_SECONDS = 5 * 60; // 5 min
export const MAX_TTL_SECONDS = 60 * 60; // 1 h (teto duro)

export type SignedUrlIntent = 'upload' | 'download';

export interface UploadValidationOk {
  ok: true;
  type: AssetType;
  maxBytes: number;
}

export interface UploadValidationError {
  ok: false;
  status: 400 | 413 | 415;
  message: string;
}

export type UploadValidationResult = UploadValidationOk | UploadValidationError;

/**
 * Resolve o segredo de assinatura. Usa um secret dedicado quando presente e cai
 * em secrets já validados pelo boot (`SESSION_ENTRY_TOKEN_SECRET` -> `JWT_SECRET`)
 * para não exigir nova env obrigatória. Lança quando nada >=32 está disponível,
 * mantendo o contrato "assinar sem segredo é 500", igual ao token de sessão.
 */
function getSigningSecret(): string {
  const candidate =
    env.ASSET_URL_SIGNING_SECRET ??
    env.SESSION_ENTRY_TOKEN_SECRET ??
    env.JWT_SECRET;

  if (!candidate || candidate.length < 32) {
    throw new Error(
      'Segredo de assinatura de assets ausente: defina ASSET_URL_SIGNING_SECRET (>=32) ou SESSION_ENTRY_TOKEN_SECRET.',
    );
  }
  return candidate;
}

function baseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
}

function clampTtl(ttl: number, fallback: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return fallback;
  return Math.min(Math.floor(ttl), MAX_TTL_SECONDS);
}

/** String canônica assinada: amarra intenção, chave, dono e expiração. */
function canonicalString(params: {
  intent: SignedUrlIntent;
  storageKey: string;
  scopeUserId: string;
  expiresAtEpoch: number;
}): string {
  return [params.intent, params.storageKey, params.scopeUserId, params.expiresAtEpoch].join(':');
}

function sign(canonical: string): string {
  return createHmac('sha256', getSigningSecret()).update(canonical).digest('hex');
}

/** Comparação constante (evita timing attack na verificação da assinatura). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Valida um candidato de upload contra MIME permitido e tamanho máximo do tipo.
 * Quando `declaredType` é omitido, infere o tipo a partir do MIME.
 */
export function validateUploadCandidate(input: {
  mimeType: string;
  fileSizeBytes: number;
  declaredType?: AssetType;
}): UploadValidationResult {
  const mime = input.mimeType.trim().toLowerCase();

  const inferredType =
    input.declaredType ??
    (Object.keys(ALLOWED_MIME_BY_TYPE) as AssetType[]).find((t) =>
      ALLOWED_MIME_BY_TYPE[t].includes(mime),
    );

  if (!inferredType) {
    return { ok: false, status: 415, message: `MIME type não suportado: ${mime}` };
  }

  if (!ALLOWED_MIME_BY_TYPE[inferredType].includes(mime)) {
    return {
      ok: false,
      status: 415,
      message: `MIME ${mime} não é permitido para o tipo ${inferredType}`,
    };
  }

  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    return { ok: false, status: 400, message: 'fileSizeBytes deve ser um inteiro positivo.' };
  }

  const maxBytes = MAX_UPLOAD_BYTES_BY_TYPE[inferredType];
  if (input.fileSizeBytes > maxBytes) {
    return {
      ok: false,
      status: 413,
      message: `Arquivo excede o limite de ${maxBytes} bytes para o tipo ${inferredType}.`,
    };
  }

  return { ok: true, type: inferredType, maxBytes };
}

/** Sanitiza um nome de arquivo para uso seguro dentro da storageKey. */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'arquivo';
}

/**
 * Constrói uma storageKey determinística-por-prefixo + sufixo aleatório,
 * particionada por escopo (session/owner) e tipo. Casa com `assetStorageKeySchema`.
 */
export function buildStorageKey(input: {
  type: AssetType;
  originalFilename: string;
  ownerId?: string | null;
  sessionId?: string | null;
}): string {
  const scope = input.sessionId
    ? `sessions/${input.sessionId}`
    : input.ownerId
      ? `owners/${input.ownerId}`
      : 'unscoped';
  const folder = input.type.toLowerCase();
  const unique = randomUUID();
  return `${scope}/${folder}/${unique}/${sanitizeFilename(input.originalFilename)}`;
}

export interface SignedUploadUrl {
  url: string;
  method: 'PUT';
  storageProvider: AssetStorageProvider;
  maxBytes: number;
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Gera uma URL PUT pré-assinada. Para LOCAL, aponta para o próprio gateway de
 * upload do app; o emissor pode sobrescrever via `provider` quando houver SDK
 * real (S3/R2). A assinatura expira e amarra a storageKey + dono.
 */
export function createSignedUploadUrl(input: {
  storageKey: string;
  scopeUserId: string;
  maxBytes: number;
  mimeType: string;
  provider?: AssetStorageProvider;
  expiresInSeconds?: number;
}): SignedUploadUrl {
  const provider = input.provider ?? 'LOCAL';
  const ttl = clampTtl(input.expiresInSeconds ?? DEFAULT_UPLOAD_TTL_SECONDS, DEFAULT_UPLOAD_TTL_SECONDS);
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + ttl;
  const signature = sign(
    canonicalString({
      intent: 'upload',
      storageKey: input.storageKey,
      scopeUserId: input.scopeUserId,
      expiresAtEpoch,
    }),
  );

  const qs = new URLSearchParams({
    key: input.storageKey,
    uid: input.scopeUserId,
    exp: String(expiresAtEpoch),
    sig: signature,
  });

  return {
    url: `${baseUrl()}/api/v1/uploads?${qs.toString()}`,
    method: 'PUT',
    storageProvider: provider,
    maxBytes: input.maxBytes,
    headers: {
      'Content-Type': input.mimeType,
      'x-upload-max-bytes': String(input.maxBytes),
    },
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

export interface SignedDownloadUrl {
  url: string;
  storageProvider: AssetStorageProvider;
  expiresAt: string;
}

/**
 * Gera uma URL GET assinada para download. A validação de owner/role acontece no
 * ato da emissão (no route handler); a URL resultante é stateless e verificável
 * por `verifySignedUrl` sem nova checagem de sessão, expirando em `MAX_TTL`.
 */
export function createSignedDownloadUrl(input: {
  assetId: string;
  storageKey: string;
  scopeUserId: string;
  provider?: AssetStorageProvider;
  expiresInSeconds?: number;
}): SignedDownloadUrl {
  const provider = input.provider ?? 'LOCAL';
  const ttl = clampTtl(
    input.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS,
    DEFAULT_DOWNLOAD_TTL_SECONDS,
  );
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + ttl;
  const signature = sign(
    canonicalString({
      intent: 'download',
      storageKey: input.storageKey,
      scopeUserId: input.scopeUserId,
      expiresAtEpoch,
    }),
  );

  const qs = new URLSearchParams({
    mode: 'fetch',
    key: input.storageKey,
    uid: input.scopeUserId,
    exp: String(expiresAtEpoch),
    sig: signature,
  });

  return {
    url: `${baseUrl()}/api/v1/assets/${input.assetId}/download?${qs.toString()}`,
    storageProvider: provider,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

export interface VerifySignedUrlInput {
  intent: SignedUrlIntent;
  storageKey: string;
  scopeUserId: string;
  expiresAtEpoch: number;
  signature: string;
  nowEpoch?: number;
}

export type VerifySignedUrlResult =
  | { valid: true }
  | { valid: false; reason: 'expired' | 'bad_signature' | 'malformed' };

/** Verifica assinatura + expiração de forma stateless e constante. */
export function verifySignedUrl(input: VerifySignedUrlInput): VerifySignedUrlResult {
  if (
    !input.storageKey ||
    !input.scopeUserId ||
    !input.signature ||
    !Number.isFinite(input.expiresAtEpoch)
  ) {
    return { valid: false, reason: 'malformed' };
  }

  const now = input.nowEpoch ?? Math.floor(Date.now() / 1000);
  if (input.expiresAtEpoch < now) {
    return { valid: false, reason: 'expired' };
  }

  const expected = sign(
    canonicalString({
      intent: input.intent,
      storageKey: input.storageKey,
      scopeUserId: input.scopeUserId,
      expiresAtEpoch: input.expiresAtEpoch,
    }),
  );

  return safeEqual(expected, input.signature)
    ? { valid: true }
    : { valid: false, reason: 'bad_signature' };
}
