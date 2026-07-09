import {
  DATA_REQUEST_TYPES,
  type DataRequestType,
  type DataRequestStatus,
} from '@/lib/privacy/data-request.schema';

/**
 * Política canônica de Data Subject Requests (DSR) - §12.4.4 / §12.4.5.
 *
 * Fonte da verdade das decisões formalizadas em ADR-0004-dsr-datarequest:
 *  - Pedidos anônimos e autenticados COMPARTILHAM o mesmo `DataRequest`
 *    (modelo unificado; o discriminador é `userId` nullable no Prisma).
 *  - Verificação de e-mail obrigatória via `PENDING_EMAIL_VERIFICATION`.
 *  - SLA, escopo por `type` e retenção do arquivo de export
 *    (`EXPORT_READY -> EXPIRED`) definidos aqui de forma tipada.
 *
 * NÃO duplica enums: importa os contratos de `data-request.schema.ts`
 * (que por sua vez espelham os enums Prisma `DataRequest*`). Endpoints DSR
 * (T-041 criação anônimo/autenticado, T-042 consulta/download,
 * T-043 cancelamento/grace period de exclusão) consomem esta política.
 */

// ─── Constantes canônicas de prazo (alinhadas à LGPD Art. 18/19) ────────────

/** SLA padrão para atendimento de qualquer pedido (LGPD Art. 19 §2). */
export const DSR_SLA_DAYS = 15;

/** Janela de validade do link de verificação de e-mail. */
export const DSR_EMAIL_VERIFICATION_TTL_HOURS = 24;

/** Tempo que o arquivo assinado de export fica disponível antes de `EXPIRED`. */
export const DSR_EXPORT_ARCHIVE_TTL_DAYS = 7;

/**
 * Grace period de exclusão: janela em que o titular pode CANCELAR um pedido
 * `DELETION` antes da execução irreversível (consumido por T-043).
 */
export const DSR_DELETION_GRACE_DAYS = 7;

/** Decisão arquitetural ratificada: um único `DataRequest` serve ambos os públicos. */
export const DSR_UNIFIED_REQUEST_MODEL = true as const;

// ─── Política por tipo ──────────────────────────────────────────────────────

export interface DataRequestTypePolicy {
  readonly type: DataRequestType;
  /** Toda solicitação passa por verificação de e-mail antes de `PENDING`. */
  readonly requiresEmailVerification: true;
  /** Exige `correctionPayload` na criação (apenas RECTIFICATION). */
  readonly requiresCorrectionPayload: boolean;
  /** Gera arquivo assinado e transita por `EXPORT_READY`. */
  readonly producesSignedArchive: boolean;
  /** Pode ser cancelado pelo titular enquanto não terminal. */
  readonly cancellableByRequester: boolean;
  /** Possui janela de arrependimento antes da execução irreversível. */
  readonly hasGracePeriod: boolean;
  /** Dias da janela de grace (null quando não se aplica). */
  readonly gracePeriodDays: number | null;
  /** SLA específico em dias. */
  readonly slaDays: number;
  /** Validade do arquivo de export em dias (null quando não produz arquivo). */
  readonly archiveTtlDays: number | null;
  /** Estados terminais a partir dos quais não há mais transição. */
  readonly terminalStatuses: readonly DataRequestStatus[];
}

const COMMON_TERMINAL: readonly DataRequestStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

const DATA_REQUEST_POLICIES: Readonly<Record<DataRequestType, DataRequestTypePolicy>> = {
  EXPORT: {
    type: 'EXPORT',
    requiresEmailVerification: true,
    requiresCorrectionPayload: false,
    producesSignedArchive: true,
    cancellableByRequester: true,
    hasGracePeriod: false,
    gracePeriodDays: null,
    slaDays: DSR_SLA_DAYS,
    archiveTtlDays: DSR_EXPORT_ARCHIVE_TTL_DAYS,
    terminalStatuses: COMMON_TERMINAL,
  },
  PORTABILITY: {
    type: 'PORTABILITY',
    requiresEmailVerification: true,
    requiresCorrectionPayload: false,
    producesSignedArchive: true,
    cancellableByRequester: true,
    hasGracePeriod: false,
    gracePeriodDays: null,
    slaDays: DSR_SLA_DAYS,
    archiveTtlDays: DSR_EXPORT_ARCHIVE_TTL_DAYS,
    terminalStatuses: COMMON_TERMINAL,
  },
  RECTIFICATION: {
    type: 'RECTIFICATION',
    requiresEmailVerification: true,
    requiresCorrectionPayload: true,
    producesSignedArchive: false,
    cancellableByRequester: true,
    hasGracePeriod: false,
    gracePeriodDays: null,
    slaDays: DSR_SLA_DAYS,
    archiveTtlDays: null,
    terminalStatuses: COMMON_TERMINAL,
  },
  DELETION: {
    type: 'DELETION',
    requiresEmailVerification: true,
    requiresCorrectionPayload: false,
    producesSignedArchive: false,
    cancellableByRequester: true,
    hasGracePeriod: true,
    gracePeriodDays: DSR_DELETION_GRACE_DAYS,
    slaDays: DSR_SLA_DAYS,
    archiveTtlDays: null,
    terminalStatuses: COMMON_TERMINAL,
  },
};

/** Retorna a política tipada de um tipo de pedido. */
export function getDataRequestPolicy(type: DataRequestType): DataRequestTypePolicy {
  return DATA_REQUEST_POLICIES[type];
}

// ─── Modelo unificado: anônimo vs autenticado ───────────────────────────────

/** Pedido é anônimo quando não há `userId` vinculado. */
export function isAnonymousRequest(userId: string | null | undefined): boolean {
  return userId == null;
}

/**
 * Verificação de e-mail é dispensável (auto-verify) apenas quando o pedido é
 * autenticado E o `requesterEmail` coincide com o e-mail já verificado da conta.
 * Qualquer outro caso (anônimo, ou e-mail divergente do da conta) exige o fluxo
 * `PENDING_EMAIL_VERIFICATION`. Mudar o e-mail é tratado como evento de segurança.
 */
export function shouldAutoVerifyEmail(params: {
  userId: string | null | undefined;
  requesterEmail: string;
  accountEmail?: string | null;
  accountEmailVerified?: boolean;
}): boolean {
  const { userId, requesterEmail, accountEmail, accountEmailVerified } = params;
  if (isAnonymousRequest(userId)) return false;
  if (!accountEmail || !accountEmailVerified) return false;
  return requesterEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

// ─── Máquina de estados (transições permitidas) ─────────────────────────────

const ALLOWED_TRANSITIONS: Readonly<Record<DataRequestStatus, readonly DataRequestStatus[]>> = {
  PENDING_EMAIL_VERIFICATION: ['PENDING', 'CANCELLED', 'EXPIRED'],
  PENDING: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
  IN_PROGRESS: ['EXPORT_READY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  EXPORT_READY: ['COMPLETED', 'EXPIRED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/** Valida se a transição `from -> to` é permitida pela máquina de estados. */
export function canTransition(from: DataRequestStatus, to: DataRequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Estado é terminal (sem transições de saída). */
export function isTerminalStatus(status: DataRequestStatus): boolean {
  return (ALLOWED_TRANSITIONS[status]?.length ?? 0) === 0;
}

/**
 * Titular pode cancelar (T-043) enquanto o pedido não é terminal. Para
 * `DELETION`, o cancelamento só é seguro dentro do grace period — `canCancel`
 * apenas verifica o estado; o gate temporal vive em `deletionGraceDeadline`.
 */
export function canRequesterCancel(type: DataRequestType, status: DataRequestStatus): boolean {
  const policy = getDataRequestPolicy(type);
  return policy.cancellableByRequester && !isTerminalStatus(status);
}

/** Download do arquivo (T-042) só é permitido em `EXPORT_READY`. */
export function canDownloadArchive(status: DataRequestStatus): boolean {
  return status === 'EXPORT_READY';
}

// ─── Cálculo de prazos (consumido pelos endpoints) ──────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** `slaDueAt` a partir do instante de criação. */
export function computeSlaDueAt(type: DataRequestType, createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + getDataRequestPolicy(type).slaDays * DAY_MS);
}

/** Expiração do arquivo de export (null para tipos que não produzem arquivo). */
export function computeArchiveExpiresAt(type: DataRequestType, readyAt: Date = new Date()): Date | null {
  const ttl = getDataRequestPolicy(type).archiveTtlDays;
  return ttl == null ? null : new Date(readyAt.getTime() + ttl * DAY_MS);
}

/** Validade do link de verificação de e-mail. */
export function computeEmailVerificationExpiresAt(issuedAt: Date = new Date()): Date {
  return new Date(issuedAt.getTime() + DSR_EMAIL_VERIFICATION_TTL_HOURS * HOUR_MS);
}

/**
 * Deadline do grace period de exclusão (T-043): após esta data o pedido
 * `DELETION` pode ser executado de forma irreversível. Null para outros tipos.
 */
export function computeDeletionGraceDeadline(type: DataRequestType, verifiedAt: Date = new Date()): Date | null {
  const policy = getDataRequestPolicy(type);
  return policy.hasGracePeriod && policy.gracePeriodDays != null
    ? new Date(verifiedAt.getTime() + policy.gracePeriodDays * DAY_MS)
    : null;
}

/** Cobertura exaustiva: a política endereça os 4 tipos reais do domínio. */
export const DATA_REQUEST_POLICY_COVERAGE: readonly DataRequestType[] = DATA_REQUEST_TYPES;
