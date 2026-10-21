import 'server-only';

import type { EbookCatalogEntry, EbookCopy } from './schema';

// Pagina de erro pura do segmento /ebooks/acesso/{token}/*: negociacao do
// idioma quando ainda nao ha pedido (D4) e HTML minimo com os headers privados
// (D3). Sem I/O e sem env; todo texto passa por escape de HTML.

export type EbookErrorCopy = EbookCopy['errors'];

/** Copy neutra curta para catalogo vazio ou slug de pedido fora do catalogo. */
export const EBOOK_NEUTRAL_ERROR_COPY: { readonly locale: 'en'; readonly errors: EbookErrorCopy } = {
  locale: 'en',
  errors: {
    checkoutUnavailable: 'Checkout is unavailable right now.',
    checkoutFailed: 'Checkout failed. Please try again.',
    accessInvalid: 'This access link is not valid.',
    accessRevoked: 'This access link is no longer active.',
    pdfUnavailable: 'The file is temporarily unavailable. Please try again later.',
    accessRateLimited: 'Too many requests. Please wait a moment and try again.',
  },
};

/** Headers privados comuns a toda resposta do segmento (sem Content-Type). */
export const EBOOK_ACCESS_PRIVATE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/** Headers da pagina de erro HTML (D3). */
export const EBOOK_ACCESS_ERROR_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  ...EBOOK_ACCESS_PRIVATE_HEADERS,
};

export interface NegotiatedEbookErrorCopy {
  locale: string;
  errors: EbookErrorCopy;
}

function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const ranked: { tag: string; q: number; order: number }[] = [];
  header.split(',').forEach((part, order) => {
    const [rawTag, ...params] = part.trim().split(';');
    const tag = rawTag?.trim().toLowerCase().split('-')[0] ?? '';
    if (!tag || tag === '*') return;
    let q = 1;
    for (const param of params) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param);
      if (match) q = Number(match[1]);
    }
    if (!Number.isFinite(q) || q <= 0) return;
    ranked.push({ tag, q, order });
  });
  return ranked.sort((a, b) => b.q - a.q || a.order - b.order).map((item) => item.tag);
}

/**
 * D4: para cada idioma pedido (ordem por `q`, empate mantem a ordem do header;
 * so o subtag primario conta), a primeira entrada do catalogo com esse locale.
 * Sem casamento, a primeira entrada; catalogo vazio, a copy neutra.
 */
export function negotiateEbookErrorCopy(input: {
  acceptLanguage: string | null | undefined;
  catalog: readonly Pick<EbookCatalogEntry, 'locale' | 'copy'>[];
}): NegotiatedEbookErrorCopy {
  const { catalog } = input;
  const first = catalog[0];
  if (!first) {
    return { locale: EBOOK_NEUTRAL_ERROR_COPY.locale, errors: EBOOK_NEUTRAL_ERROR_COPY.errors };
  }
  for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
    const match = catalog.find((entry) => entry.locale === tag);
    if (match) return { locale: match.locale, errors: match.copy.errors };
  }
  return { locale: first.locale, errors: first.copy.errors };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export interface EbookAccessErrorPageInput {
  status: 404 | 410 | 429 | 503;
  locale: string;
  message: string;
  /** So usado quando `status === 429`. */
  retryAfterSeconds?: number | undefined;
}

/** Pagina HTML minima de erro com `lang`, meta robots e os headers de D3. */
export function renderEbookAccessErrorPage(input: EbookAccessErrorPageInput): Response {
  const lang = escapeHtml(input.locale);
  const message = escapeHtml(input.message);
  const html =
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="robots" content="noindex,nofollow">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${message}</title></head><body><main><p>${message}</p></main></body></html>`;

  const headers = new Headers(EBOOK_ACCESS_ERROR_HEADERS);
  if (input.status === 429 && input.retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(Math.max(1, Math.ceil(input.retryAfterSeconds))));
  }
  return new Response(html, { status: input.status, headers });
}
