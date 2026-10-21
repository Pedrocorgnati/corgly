import 'server-only';
import path from 'node:path';

import type { PrismaClient, EbookPaymentStatus } from '@prisma/client';
import type { RateLimitConfig } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { hashEbookAccessToken, isWellFormedEbookAccessToken } from './access-token';
import { negotiateEbookErrorCopy, EBOOK_NEUTRAL_ERROR_COPY } from './access-page';
import type { EbookCatalogEntry } from './schema';

// Resolucao do acesso ao ebook (D3): rate limit, validacao do token, estado do
// pedido, disponibilidade do PDF e gravacao do download. O token cru nunca vai
// para log, erro ou chave de rate limit; so o hash.

/** Erro de configuracao do acesso (guard do diretorio publico, limite invalido). */
export class EbookAccessConfigError extends AppError {
  constructor(
    code: 'EBOOK_ACCESS_PRIVATE_DIR_PUBLIC' | 'EBOOK_ACCESS_DOWNLOAD_LIMIT_INVALID',
    message: string,
  ) {
    super(code, message, 500);
    this.name = 'EbookAccessConfigError';
  }
}

export interface EbookAccessOrder {
  id: string;
  slug: string;
  locale: string;
  paymentStatus: EbookPaymentStatus;
  stripePaymentIntentId: string | null;
  firstDownloadAt: Date | null;
  createdAt: Date;
}

export interface EbookAccessTokenRow {
  id: string;
  downloadCount: number;
  revokedAt: Date | null;
}

export type EbookAccessRateLimiter = (
  key: string,
  config: RateLimitConfig,
) => Promise<{ allowed: boolean; resetAt: number }>;

export interface EbookAccessDeps {
  prisma: Pick<PrismaClient, 'ebookAccessToken' | 'ebookOrder' | 'ebookAccessLog' | '$transaction'>;
  catalog: readonly EbookCatalogEntry[];
  rateLimit: EbookAccessRateLimiter;
  /** Thunk: pode lancar erro de configuracao (env ausente ou relativa). */
  privateDir(): string;
  cwd(): string;
  checkPdf(
    entry: EbookCatalogEntry,
    privateDir: string,
  ): Promise<{ absolutePath: string; sizeBytes: number }>;
  now(): Date;
  /** Thunk: null = sem limite; lanca EbookAccessConfigError quando invalido. */
  downloadLimit(): number | null;
}

interface Base {
  locale: string;
  message: string;
}

export type EbookAccessResult =
  | (Base & { kind: 'rate_limited'; status: 429; retryAfterSeconds: number })
  | (Base & { kind: 'invalid'; status: 404 })
  | (Base & { kind: 'revoked'; status: 410 })
  | (Base & { kind: 'unavailable'; status: 503 })
  | {
      kind: 'ready';
      status: 200;
      locale: string;
      entry: EbookCatalogEntry;
      order: EbookAccessOrder;
      token: EbookAccessTokenRow;
      /** null quando requirePdf === false */
      pdf: { absolutePath: string; sizeBytes: number } | null;
    };

const EBOOK_ACCESS_LOG_PREFIX = '[ebooks-access]';

/** Segundos ate a janela do rate limit fechar, minimo 1. */
function retryAfterSecondsFrom(resetAt: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAt - nowMs) / 1000));
}

/**
 * Resolve o acesso (D3): rate limit por IP e por hash do token, estado do
 * pedido, catalogo e PDF. Sempre devolve um resultado definido; erros de
 * configuracao do PDF viram 503 com a copy da entrada.
 */
export async function resolveEbookAccess(
  deps: EbookAccessDeps,
  input: {
    token: string;
    ip: string;
    acceptLanguage: string | null | undefined;
    requirePdf?: boolean | undefined;
  },
): Promise<EbookAccessResult> {
  const now = deps.now();
  const fallback = negotiateEbookErrorCopy({
    acceptLanguage: input.acceptLanguage,
    catalog: deps.catalog,
  });

  const ipLimit = await deps.rateLimit(`ebook-access:ip:${input.ip}`, RATE_LIMITS.EBOOK_ACCESS);
  if (!ipLimit.allowed) {
    return {
      kind: 'rate_limited',
      status: 429,
      retryAfterSeconds: retryAfterSecondsFrom(ipLimit.resetAt, now.getTime()),
      locale: fallback.locale,
      message: fallback.errors.accessRateLimited,
    };
  }

  if (!isWellFormedEbookAccessToken(input.token)) {
    return { kind: 'invalid', status: 404, locale: fallback.locale, message: fallback.errors.accessInvalid };
  }

  const tokenHash = hashEbookAccessToken(input.token);
  const tokenLimit = await deps.rateLimit(`ebook-access:token:${tokenHash}`, RATE_LIMITS.EBOOK_ACCESS);
  if (!tokenLimit.allowed) {
    return {
      kind: 'rate_limited',
      status: 429,
      retryAfterSeconds: retryAfterSecondsFrom(tokenLimit.resetAt, now.getTime()),
      locale: fallback.locale,
      message: fallback.errors.accessRateLimited,
    };
  }

  const row = await deps.prisma.ebookAccessToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      downloadCount: true,
      revokedAt: true,
      order: {
        select: {
          id: true,
          slug: true,
          locale: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          firstDownloadAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!row) {
    return { kind: 'invalid', status: 404, locale: fallback.locale, message: fallback.errors.accessInvalid };
  }

  const entry = deps.catalog.find((item) => item.slug === row.order.slug);
  if (!entry) {
    logger.error(`${EBOOK_ACCESS_LOG_PREFIX} slug do pedido fora do catalogo`, {
      orderId: row.order.id,
      slug: row.order.slug,
    });
    return {
      kind: 'unavailable',
      status: 503,
      locale: EBOOK_NEUTRAL_ERROR_COPY.locale,
      message: EBOOK_NEUTRAL_ERROR_COPY.errors.pdfUnavailable,
    };
  }

  const order: EbookAccessOrder = {
    id: row.order.id,
    slug: row.order.slug,
    locale: row.order.locale,
    paymentStatus: row.order.paymentStatus,
    stripePaymentIntentId: row.order.stripePaymentIntentId,
    firstDownloadAt: row.order.firstDownloadAt,
    createdAt: row.order.createdAt,
  };
  const tokenRow: EbookAccessTokenRow = {
    id: row.id,
    downloadCount: row.downloadCount,
    revokedAt: row.revokedAt,
  };

  // Estorno parcial mantem o acesso; qualquer outro status fora de PAID revoga.
  const revoked =
    row.revokedAt !== null ||
    (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED');
  if (revoked) {
    return {
      kind: 'revoked',
      status: 410,
      locale: entry.locale,
      message: entry.copy.errors.accessRevoked,
    };
  }

  const requirePdf = input.requirePdf !== false;
  let pdf: { absolutePath: string; sizeBytes: number } | null = null;
  if (requirePdf) {
    try {
      const dir = deps.privateDir();
      assertEbooksPrivateDirNotPublic(dir, deps.cwd());
      // So valida a configuracao; o limite e aplicado em recordEbookDownload.
      deps.downloadLimit();
      pdf = await deps.checkPdf(entry, dir);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      logger.error(`${EBOOK_ACCESS_LOG_PREFIX} PDF ou configuracao indisponivel`, {
        orderId: order.id,
        slug: order.slug,
        code: typeof code === 'string' ? code : undefined,
      });
      return {
        kind: 'unavailable',
        status: 503,
        locale: entry.locale,
        message: entry.copy.errors.pdfUnavailable,
      };
    }
  }

  return {
    kind: 'ready',
    status: 200,
    locale: entry.locale,
    entry,
    order,
    token: tokenRow,
    pdf,
  };
}

/**
 * D2: o diretorio privado nao pode ser public/ nem ficar dentro dele. '..foo'
 * e nome valido dentro de public; so '..' ou '..<sep>' saem dele.
 */
export function assertEbooksPrivateDirNotPublic(privateDir: string, cwd: string): void {
  const publicDir = path.resolve(cwd, 'public');
  const target = path.resolve(privateDir);
  const rel = path.relative(publicDir, target);
  const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (rel === '' || !outside) {
    throw new EbookAccessConfigError(
      'EBOOK_ACCESS_PRIVATE_DIR_PUBLIC',
      'EBOOKS_PRIVATE_DIR nao pode ficar em public/ nem dentro dele.',
    );
  }
}

/** Ausente ou so espacos: null; /^\d+$/ e > 0: numero; resto lanca configuracao invalida. */
export function parseEbookDownloadLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new EbookAccessConfigError(
      'EBOOK_ACCESS_DOWNLOAD_LIMIT_INVALID',
      'EBOOK_DOWNLOAD_LIMIT deve ser um inteiro positivo.',
    );
  }
  return value;
}

export type EbookDownloadRecordResult =
  | { recorded: true }
  | { recorded: false; reason: 'limit_or_revoked' };

/** Sentinela interno: limite atingido ou token revogado dentro da transacao. */
class EbookDownloadNotRecordedError extends Error {}

/**
 * Grava o download em transacao interativa: incremento condicional do contador,
 * log de acesso e primeiro download do pedido. Sentinela vira recorded: false;
 * qualquer outro erro propaga.
 */
export async function recordEbookDownload(
  deps: Pick<EbookAccessDeps, 'prisma' | 'now' | 'downloadLimit'>,
  input: {
    order: Pick<EbookAccessOrder, 'id'>;
    token: Pick<EbookAccessTokenRow, 'id'>;
    ip: string;
  },
): Promise<EbookDownloadRecordResult> {
  const limit = deps.downloadLimit();
  try {
    await deps.prisma.$transaction(async (tx) => {
      const updated = await tx.ebookAccessToken.updateMany({
        where: {
          id: input.token.id,
          revokedAt: null,
          ...(limit !== null ? { downloadCount: { lt: limit } } : {}),
        },
        data: { downloadCount: { increment: 1 } },
      });
      if (updated.count === 0) throw new EbookDownloadNotRecordedError();

      await tx.ebookAccessLog.create({
        data: { orderId: input.order.id, tokenId: input.token.id, ip: input.ip },
      });

      await tx.ebookOrder.updateMany({
        where: { id: input.order.id, firstDownloadAt: null },
        data: { firstDownloadAt: deps.now() },
      });
    });
  } catch (err) {
    if (err instanceof EbookDownloadNotRecordedError) {
      return { recorded: false, reason: 'limit_or_revoked' };
    }
    throw err;
  }
  return { recorded: true };
}
