// Confirmacao da desistencia (D8): POST da pagina de desistencia; responde com
// redirect relativo 303 para a pagina de resultado da mesma etapa.

import type { NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe';
import {
  parseEbookDownloadLimit,
  type EbookAccessDeps,
} from '@/lib/ebooks/access';
import {
  EBOOK_ACCESS_PRIVATE_HEADERS,
  EBOOK_NEUTRAL_ERROR_COPY,
  negotiateEbookErrorCopy,
  renderEbookAccessErrorPage,
} from '@/lib/ebooks/access-page';
import { getEbookClientIp } from '@/lib/ebooks/client-ip';
import { getEbookCatalog } from '@/lib/ebooks/catalog';
import { checkEbookPdf } from '@/lib/ebooks/pdf-check';
import { resolveEbooksPrivateDir } from '@/lib/ebooks/private-dir';
import {
  getEbookWithdrawalView,
  requestEbookWithdrawal,
  type EbookWithdrawalStatus,
} from '@/lib/ebooks/withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deps reais do resolvedor de acesso. O catalogo pode lancar (registro
 * invalido), entao esta chamada precisa ficar dentro do try do handler.
 */
function buildDeps(): EbookAccessDeps {
  return {
    prisma,
    catalog: getEbookCatalog(),
    rateLimit: checkRateLimit,
    privateDir: () => resolveEbooksPrivateDir(process.env),
    cwd: () => process.cwd(),
    checkPdf: (entry, dir) => checkEbookPdf(entry, dir),
    now: () => new Date(),
    downloadLimit: () => parseEbookDownloadLimit(process.env.EBOOK_DOWNLOAD_LIMIT),
  };
}

/** 303 com Location RELATIVA: nada de host interno atras de proxy. */
function withdrawalRedirect(token: string, status: EbookWithdrawalStatus): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/ebooks/acesso/' + token + '/desistir?status=' + status,
      ...EBOOK_ACCESS_PRIVATE_HEADERS,
    },
  });
}

/**
 * 503 antes do ready: copy negociada com o catalogo obtido em try separado;
 * catalogo indisponivel cai na copy neutra. Nunca reflete a mensagem do erro.
 */
function unavailableErrorPage(acceptLanguage: string | null): Response {
  try {
    const negotiated = negotiateEbookErrorCopy({
      acceptLanguage,
      catalog: getEbookCatalog(),
    });
    return renderEbookAccessErrorPage({
      status: 503,
      locale: negotiated.locale,
      message: negotiated.errors.pdfUnavailable,
    });
  } catch {
    return renderEbookAccessErrorPage({
      status: 503,
      locale: EBOOK_NEUTRAL_ERROR_COPY.locale,
      message: EBOOK_NEUTRAL_ERROR_COPY.errors.pdfUnavailable,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const acceptLanguage = request.headers.get('accept-language');
  // Zero Silencio: com ready registrado, qualquer falha vira status=error.
  let ready = false;

  try {
    const view = await getEbookWithdrawalView(buildDeps(), {
      token,
      ip: getEbookClientIp(request.headers),
      acceptLanguage,
    });

    if (view.kind !== 'ready') {
      return renderEbookAccessErrorPage({
        status: view.status,
        locale: view.locale,
        message: view.message,
        ...(view.kind === 'rate_limited' ? { retryAfterSeconds: view.retryAfterSeconds } : {}),
      });
    }

    ready = true;
    // getStripe so e chamado no estado ready.
    const { status } = await requestEbookWithdrawal(
      { prisma, stripe: getStripe() },
      { order: view.order, now: new Date() },
    );
    return withdrawalRedirect(token, status);
  } catch (err) {
    logger.error('[ebooks-withdrawal] falha inesperada na confirmacao', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    if (ready) {
      return withdrawalRedirect(token, 'error');
    }
    return unavailableErrorPage(acceptLanguage);
  }
}

function methodNotAllowed(): Response {
  return new Response('Method not allowed.', {
    status: 405,
    headers: {
      Allow: 'POST',
      'Content-Type': 'text/plain; charset=utf-8',
      ...EBOOK_ACCESS_PRIVATE_HEADERS,
    },
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
