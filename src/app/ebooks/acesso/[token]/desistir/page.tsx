// Pagina de desistencia do pedido (D8): GET de leitura para o scanner de email,
// sem mutacao de estado; a confirmacao acontece no POST de ./confirmar/route.ts.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactElement } from 'react';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  parseEbookDownloadLimit,
  type EbookAccessDeps,
  type EbookAccessResult,
} from '@/lib/ebooks/access';
import { EBOOK_NEUTRAL_ERROR_COPY } from '@/lib/ebooks/access-page';
import { getEbookClientIp } from '@/lib/ebooks/client-ip';
import { getEbookCatalog } from '@/lib/ebooks/catalog';
import { checkEbookPdf } from '@/lib/ebooks/pdf-check';
import { resolveEbooksPrivateDir } from '@/lib/ebooks/private-dir';
import {
  getEbookWithdrawalView,
  isEbookWithdrawalStatus,
  type EbookWithdrawalStatus,
} from '@/lib/ebooks/withdrawal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const MAIN_CLASS = 'mx-auto max-w-xl px-4 py-12 text-foreground';
const TITLE_CLASS = 'mb-6 text-3xl font-semibold';
const PARAGRAPH_CLASS = 'mb-4 whitespace-pre-line text-muted-foreground';
const FORM_CLASS = 'mt-8';
const BUTTON_CLASS = 'rounded-md bg-primary px-4 py-2 text-primary-foreground';

/**
 * Deps reais do resolvedor de acesso. O catalogo pode lancar (registro
 * invalido), entao esta chamada precisa ficar dentro do try da pagina.
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

/** Cada paragrafo separado por linha em branco vira um <p>; sem HTML bruto. */
function Paragraphs({ text }: { text: string }): ReactElement {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '')
        .map((paragraph, index) => (
          <p key={index} className={PARAGRAPH_CLASS}>
            {paragraph}
          </p>
        ))}
    </>
  );
}

export default async function EbookWithdrawalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { token } = await params;
  const query = await searchParams;
  const requestHeaders = await headers();
  const ip = getEbookClientIp(requestHeaders);
  const acceptLanguage = requestHeaders.get('accept-language');

  let view: EbookAccessResult | null = null;
  try {
    view = await getEbookWithdrawalView(buildDeps(), { token, ip, acceptLanguage });
  } catch (err) {
    // Zero Silencio: o erro e registrado sem token, hash, email ou mensagem.
    logger.error('[ebooks-withdrawal] falha inesperada na pagina de desistencia', {
      name: err instanceof Error ? err.name : 'unknown',
    });
  }

  if (view === null) {
    return (
      <main lang={EBOOK_NEUTRAL_ERROR_COPY.locale} className={MAIN_CLASS}>
        <Paragraphs text={EBOOK_NEUTRAL_ERROR_COPY.errors.pdfUnavailable} />
      </main>
    );
  }

  // Pagina de texto: status HTTP e Retry-After ficam com a rota de confirmar.
  if (view.kind !== 'ready') {
    return (
      <main lang={view.locale} className={MAIN_CLASS}>
        <Paragraphs text={view.message} />
      </main>
    );
  }

  const withdrawal = view.entry.copy.withdrawal;
  const rawStatus = query.status;
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;

  if (isEbookWithdrawalStatus(status)) {
    const statusBody: Record<EbookWithdrawalStatus, string> = {
      accepted: withdrawal.acceptedBody,
      review: withdrawal.reviewBody,
      expired: withdrawal.expiredBody,
      error: withdrawal.errorBody,
    };
    return (
      <main lang={view.locale} className={MAIN_CLASS}>
        <h1 className={TITLE_CLASS}>{withdrawal.title}</h1>
        <Paragraphs text={statusBody[status]} />
      </main>
    );
  }

  // Estado inicial: o action so e montado com token ja validado pelo resolvedor.
  return (
    <main lang={view.locale} className={MAIN_CLASS}>
      <h1 className={TITLE_CLASS}>{withdrawal.title}</h1>
      <Paragraphs text={withdrawal.body} />
      <form
        method="post"
        action={'/ebooks/acesso/' + token + '/desistir/confirmar'}
        className={FORM_CLASS}
      >
        <button type="submit" className={BUTTON_CLASS}>
          {withdrawal.confirmLabel}
        </button>
      </form>
    </main>
  );
}
