import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  checkEbookPdf,
  EBOOK_ACCESS_PRIVATE_HEADERS,
  EBOOK_NEUTRAL_ERROR_COPY,
  getEbookCatalog,
  getEbookClientIp,
  negotiateEbookErrorCopy,
  parseEbookDownloadLimit,
  recordEbookDownload,
  renderEbookAccessErrorPage,
  resolveEbookAccess,
  resolveEbooksPrivateDir,
  type EbookAccessDeps,
  type EbookCatalogEntry,
} from '@/lib/ebooks';

/**
 * GET /ebooks/acesso/{token}
 *
 * Entrega o PDF do ebook pelo token do email (D1-D6). Sem sessao: o token e a
 * autorizacao. Ordem das defesas em resolveEbookAccess: rate limit por IP ->
 * formato -> rate limit por hash -> lookup -> estado -> PDF. No estado pronto
 * grava o download (contador, log, primeiro download) e so depois faz o stream.
 *
 * O token cru nunca vai para log; erro inesperado vira 503 com a pagina de D3.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

function buildDeps(catalog: readonly EbookCatalogEntry[]): EbookAccessDeps {
  return {
    prisma,
    catalog,
    rateLimit: checkRateLimit,
    privateDir: () => resolveEbooksPrivateDir(process.env),
    cwd: () => process.cwd(),
    checkPdf: (entry, dir) => checkEbookPdf(entry, dir),
    now: () => new Date(),
    downloadLimit: () => parseEbookDownloadLimit(process.env.EBOOK_DOWNLOAD_LIMIT),
  };
}

/** filename ASCII de fallback + filename* UTF-8 com o titulo (RFC 6266 4.3). */
function contentDisposition(entry: EbookCatalogEntry): string {
  return `attachment; filename="${entry.pdfFile}"; filename*=UTF-8''${encodeURIComponent(`${entry.title}.pdf`)}`;
}

function unexpectedErrorPage(
  catalog: readonly EbookCatalogEntry[] | null,
  acceptLanguage: string | null,
): Response {
  const copy = catalog ? negotiateEbookErrorCopy({ acceptLanguage, catalog }) : EBOOK_NEUTRAL_ERROR_COPY;
  return renderEbookAccessErrorPage({ status: 503, locale: copy.locale, message: copy.errors.pdfUnavailable });
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const { token } = await params;
  const acceptLanguage = request.headers.get('accept-language');
  const ip = getEbookClientIp(request.headers);
  let catalog: readonly EbookCatalogEntry[] | null = null;

  try {
    catalog = getEbookCatalog();
    const deps = buildDeps(catalog);
    const access = await resolveEbookAccess(deps, { token, ip, acceptLanguage });

    if (access.kind !== 'ready') {
      return renderEbookAccessErrorPage({
        status: access.status,
        locale: access.locale,
        message: access.message,
        ...(access.kind === 'rate_limited' ? { retryAfterSeconds: access.retryAfterSeconds } : {}),
      });
    }

    const pdf = access.pdf;
    if (!pdf) {
      // requirePdf e o default: sem PDF aqui e defeito de contrato, nao do cliente.
      throw new Error('PDF ausente no estado pronto');
    }

    const recorded = await recordEbookDownload(deps, { order: access.order, token: access.token, ip });
    if (!recorded.recorded) {
      return renderEbookAccessErrorPage({
        status: 410,
        locale: access.entry.locale,
        message: access.entry.copy.errors.accessRevoked,
      });
    }

    const body = Readable.toWeb(createReadStream(pdf.absolutePath)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.sizeBytes),
        'Content-Disposition': contentDisposition(access.entry),
        ...EBOOK_ACCESS_PRIVATE_HEADERS,
      },
    });
  } catch (err) {
    logger.error('[ebooks-access] falha inesperada na entrega', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return unexpectedErrorPage(catalog, acceptLanguage);
  }
}

/**
 * HEAD /ebooks/acesso/{token}
 *
 * Sem este export o Next deriva HEAD do GET, e um HEAD (scanner, prefetch,
 * `curl -sI`) gravaria o download e encerraria a janela de desistencia. Aqui o
 * token passa pelo mesmo resolvedor e o status/headers espelham o GET, mas nada
 * e gravado e o PDF nao e aberto.
 */
export async function HEAD(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const { token } = await params;
  const acceptLanguage = request.headers.get('accept-language');
  const ip = getEbookClientIp(request.headers);
  let catalog: readonly EbookCatalogEntry[] | null = null;

  try {
    catalog = getEbookCatalog();
    const access = await resolveEbookAccess(buildDeps(catalog), { token, ip, acceptLanguage });

    if (access.kind !== 'ready') {
      return withoutBody(
        renderEbookAccessErrorPage({
          status: access.status,
          locale: access.locale,
          message: access.message,
          ...(access.kind === 'rate_limited' ? { retryAfterSeconds: access.retryAfterSeconds } : {}),
        }),
      );
    }

    const pdf = access.pdf;
    if (!pdf) {
      throw new Error('PDF ausente no estado pronto');
    }

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.sizeBytes),
        'Content-Disposition': contentDisposition(access.entry),
        ...EBOOK_ACCESS_PRIVATE_HEADERS,
      },
    });
  } catch (err) {
    logger.error('[ebooks-access] falha inesperada no HEAD', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return withoutBody(unexpectedErrorPage(catalog, acceptLanguage));
  }
}

/** Mesmo status e headers, sem corpo (HEAD nunca leva corpo). */
function withoutBody(response: Response): Response {
  return new Response(null, { status: response.status, headers: response.headers });
}

function methodNotAllowed(): Response {
  return new Response('Method not allowed.', {
    status: 405,
    headers: {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
      ...EBOOK_ACCESS_PRIVATE_HEADERS,
    },
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
