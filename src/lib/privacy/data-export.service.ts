import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { canDownloadArchive } from '@/lib/privacy/data-request.policy';
import type { DataRequestStatus, DataRequestType, DataRequestChannel } from '@/lib/privacy/data-request.schema';

/**
 * Serviço de consulta e download de Data Subject Requests (DSR) - T-042 / X-19.
 *
 * Cobre a parte de LEITURA do ciclo de vida ratificado em ADR-0004
 * (modelo unificado `DataRequest`, `userId` nullable como discriminador):
 *
 *   1. Consulta dos pedidos próprios do titular autenticado (`/me`).
 *   2. Autorização e resolução do arquivo assinado de export (`/{id}/download`).
 *
 * A GERAÇÃO do pacote de export (escrita de `signedArchiveUrl` + transição para
 * `EXPORT_READY`) é responsabilidade do worker DSR (T-067); este serviço apenas
 * AUTORIZA e RESOLVE o arquivo já produzido, garantindo que nenhum titular
 * acesse o pacote de outro (LGPD Art. 18/19; Acceptance T-042).
 *
 * Tokens de download anônimo são HMAC purpose-bound: a chave é derivada de
 * `JWT_SECRET` via HMAC, de modo que o vazamento de um link de download nunca
 * expõe o segredo de autenticação nem permite forjar JWTs de sessão.
 */

// Chave de assinatura dedicada (derivada, não o JWT_SECRET cru).
const DOWNLOAD_SIGNING_KEY = createHmac('sha256', env.JWT_SECRET)
  .update('dsr:data-export:download:v1')
  .digest();

/** Razões canônicas de negação/estado do download (Zero Estados Indefinidos). */
export type DownloadDecisionReason =
  | 'OK'
  | 'FORBIDDEN'
  | 'NOT_READY'
  | 'ARCHIVE_MISSING'
  | 'ARCHIVE_EXPIRED'
  | 'TOKEN_INVALID';

/** Projeção segura de um `DataRequest` exposta ao titular (sem segredos). */
export interface DataRequestSummary {
  id: string;
  referenceCode: string;
  type: DataRequestType;
  status: DataRequestStatus;
  channel: DataRequestChannel;
  requesterEmailVerified: boolean;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  rejectionReason: string | null;
  /** Estado do arquivo de export, derivado (nunca a URL assinada crua). */
  archive: {
    /** Pode ser baixado AGORA (EXPORT_READY + URL presente + não expirado). */
    available: boolean;
    expiresAt: string | null;
    expired: boolean;
  };
  /** Caminho relativo de download quando disponível (sem token para o dono). */
  downloadPath: string | null;
}

/** Linha mínima do `DataRequest` necessária para autorizar/resolver download. */
export interface DownloadCandidate {
  id: string;
  userId: string | null;
  status: DataRequestStatus;
  signedArchiveUrl: string | null;
  signedArchiveSha256: string | null;
  signedArchiveExpiresAt: Date | null;
}

/** Alvo resolvido de download (somente quando a decisão é `OK`). */
export interface DownloadTarget {
  url: string;
  sha256: string | null;
  expiresAt: string | null;
}

export interface DownloadDecision {
  reason: DownloadDecisionReason;
  target: DownloadTarget | null;
}

// ─── Tokens de download anônimo (HMAC com expiração embutida) ────────────────

/** Caminho canônico do endpoint de download de um pedido. */
export function buildDownloadPath(dataRequestId: string, token?: string | null): string {
  const base = `/api/v1/privacy/data-requests/${encodeURIComponent(dataRequestId)}/download`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function computeTokenSignature(dataRequestId: string, expiresAtMs: number): string {
  return createHmac('sha256', DOWNLOAD_SIGNING_KEY)
    .update(`${dataRequestId}.${expiresAtMs}`)
    .digest('hex');
}

/**
 * Gera um token de download para um pedido ANÔNIMO. O worker (T-067) embute o
 * token no link enviado por e-mail; o token expira junto do arquivo, nunca
 * concede acesso a outro `dataRequestId` e não é reutilizável após `expiresAt`.
 */
export function signDownloadToken(dataRequestId: string, expiresAt: Date): string {
  const expiresAtMs = expiresAt.getTime();
  const signature = computeTokenSignature(dataRequestId, expiresAtMs);
  return `${expiresAtMs}.${signature}`;
}

/**
 * Valida um token de download contra um `dataRequestId` específico em tempo
 * constante. Retorna false para token malformado, assinatura divergente,
 * expirado, ou atrelado a outro pedido (anti-vazamento cross-request).
 */
export function verifyDownloadToken(token: string, dataRequestId: string, now: Date = new Date()): boolean {
  const sep = token.indexOf('.');
  if (sep <= 0) return false;

  const expiresAtMs = Number(token.slice(0, sep));
  const providedSignature = token.slice(sep + 1);
  if (!Number.isFinite(expiresAtMs) || providedSignature.length === 0) return false;
  if (expiresAtMs <= now.getTime()) return false;

  const expectedSignature = computeTokenSignature(dataRequestId, expiresAtMs);
  const provided = Buffer.from(providedSignature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ─── Consulta dos pedidos próprios (rota /me) ────────────────────────────────

function toDataRequestSummary(
  dr: {
    id: string;
    referenceCode: string;
    type: DataRequestType;
    status: DataRequestStatus;
    channel: DataRequestChannel;
    requesterEmailVerifiedAt: Date | null;
    signedArchiveUrl: string | null;
    signedArchiveExpiresAt: Date | null;
    slaDueAt: Date;
    completedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  now: Date = new Date(),
): DataRequestSummary {
  const expired = dr.signedArchiveExpiresAt != null && dr.signedArchiveExpiresAt.getTime() <= now.getTime();
  const available = canDownloadArchive(dr.status) && dr.signedArchiveUrl != null && !expired;

  return {
    id: dr.id,
    referenceCode: dr.referenceCode,
    type: dr.type,
    status: dr.status,
    channel: dr.channel,
    requesterEmailVerified: dr.requesterEmailVerifiedAt != null,
    slaDueAt: dr.slaDueAt.toISOString(),
    createdAt: dr.createdAt.toISOString(),
    updatedAt: dr.updatedAt.toISOString(),
    completedAt: dr.completedAt?.toISOString() ?? null,
    rejectionReason: dr.rejectionReason,
    archive: {
      available,
      expiresAt: dr.signedArchiveExpiresAt?.toISOString() ?? null,
      expired,
    },
    // O dono autenticado dispensa token: a rota de download valida a sessão.
    downloadPath: available ? buildDownloadPath(dr.id) : null,
  };
}

/**
 * Lista os pedidos do titular autenticado, mais recentes primeiro. Só retorna
 * pedidos vinculados ao próprio `userId`; pedidos anônimos do mesmo e-mail não
 * aparecem aqui (consulta-se por código de referência via outra rota).
 */
export async function listOwnDataRequests(userId: string, now: Date = new Date()): Promise<DataRequestSummary[]> {
  const rows = await prisma.dataRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      referenceCode: true,
      type: true,
      status: true,
      channel: true,
      requesterEmailVerifiedAt: true,
      signedArchiveUrl: true,
      signedArchiveExpiresAt: true,
      slaDueAt: true,
      completedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((row) => toDataRequestSummary(row, now));
}

// ─── Autorização + resolução do download (rota /{id}/download) ───────────────

/**
 * Decide se um pedido de download pode prosseguir e resolve o alvo assinado.
 *
 * Autorização (anti-vazamento, Acceptance T-042):
 *  - Pedido AUTENTICADO (`userId != null`): exige `authUserId === userId`.
 *  - Pedido ANÔNIMO (`userId == null`): exige `token` HMAC válido para este id.
 *
 * Após autorizar, valida o estado do arquivo: precisa estar `EXPORT_READY`, com
 * URL presente e dentro da validade (`signedArchiveExpiresAt`).
 */
export function authorizeDownload(params: {
  dataRequest: DownloadCandidate;
  authUserId: string | null;
  token: string | null;
  now?: Date;
}): DownloadDecision {
  const { dataRequest, authUserId, token } = params;
  const now = params.now ?? new Date();

  // 1) Autorização por proveniência do pedido.
  if (dataRequest.userId != null) {
    if (authUserId == null || authUserId !== dataRequest.userId) {
      return { reason: 'FORBIDDEN', target: null };
    }
  } else {
    if (!token || !verifyDownloadToken(token, dataRequest.id, now)) {
      return { reason: 'TOKEN_INVALID', target: null };
    }
  }

  // 2) Estado do arquivo.
  if (!canDownloadArchive(dataRequest.status)) {
    return { reason: 'NOT_READY', target: null };
  }
  if (!dataRequest.signedArchiveUrl) {
    return { reason: 'ARCHIVE_MISSING', target: null };
  }
  if (dataRequest.signedArchiveExpiresAt != null && dataRequest.signedArchiveExpiresAt.getTime() <= now.getTime()) {
    return { reason: 'ARCHIVE_EXPIRED', target: null };
  }

  return {
    reason: 'OK',
    target: {
      url: dataRequest.signedArchiveUrl,
      sha256: dataRequest.signedArchiveSha256,
      expiresAt: dataRequest.signedArchiveExpiresAt?.toISOString() ?? null,
    },
  };
}

/** Mapeia a razão da decisão para status HTTP + mensagem ao titular. */
export function downloadDecisionToHttp(reason: DownloadDecisionReason): { status: number; message: string } {
  switch (reason) {
    case 'OK':
      return { status: 200, message: 'Arquivo disponível.' };
    case 'FORBIDDEN':
      // 404 (não 403) para pedidos autenticados de outro titular: não revela
      // a existência do recurso a quem não é dono.
      return { status: 404, message: 'Pedido não encontrado.' };
    case 'TOKEN_INVALID':
      return { status: 403, message: 'Link de download inválido ou expirado.' };
    case 'NOT_READY':
      return { status: 409, message: 'O arquivo ainda está sendo preparado.' };
    case 'ARCHIVE_MISSING':
      return { status: 409, message: 'O arquivo deste pedido não está disponível.' };
    case 'ARCHIVE_EXPIRED':
      return { status: 410, message: 'O link de download expirou. Solicite um novo pedido.' };
    default: {
      // Exaustividade: qualquer razão nova quebra o build aqui.
      reason satisfies never;
      return { status: 500, message: 'Erro ao resolver o download.' };
    }
  }
}
