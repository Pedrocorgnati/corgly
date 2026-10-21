import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EBOOK_LOCALE_TO_APP_LOCALE } from '@/components/ebooks/locale';
import { buttonVariants } from '@/components/ui/button-variants';
import { ROUTES } from '@/lib/constants/routes';
import {
  buildDefaultEbookFulfillmentDeps,
  fulfillEbookCheckoutSession,
  getEbookBySlug,
  reconcileEbookDeliveryOnSuccessPage,
} from '@/lib/ebooks';
import type { EbookFulfillmentStatus } from '@/lib/ebooks';
import { EbookFulfillmentError } from '@/lib/ebooks/errors';
import { EBOOK_RESERVED_SLUGS } from '@/lib/ebooks/schema';
import type { EbookCatalogEntry } from '@/lib/ebooks/schema';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Formato do session id criado pelo checkout; fora disso a compra nao e identificavel.
const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

type SuccessState =
  | 'pending'
  | 'delivered'
  | 'failedPayment'
  | 'revoked'
  | 'needsReview'
  | 'missingSession';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string | string[] }>;
}

// Slug reservado ou desconhecido nao tem pagina de venda.
function resolveEntry(slug: string): EbookCatalogEntry | undefined {
  if ((EBOOK_RESERVED_SLUGS as readonly string[]).includes(slug)) return undefined;
  return getEbookBySlug(slug);
}

// Identificador fica mascarado em log.
function maskId(value: string): string {
  return value.slice(0, 10) + '***' + value.slice(-4);
}

function mapStatus(status: EbookFulfillmentStatus): SuccessState {
  switch (status) {
    case 'pending_payment':
    case 'in_progress':
    case 'accepted':
      return 'pending';
    case 'delivered':
      return 'delivered';
    case 'failed_payment':
      return 'failedPayment';
    case 'revoked':
      return 'revoked';
    case 'needs_review':
    case 'not_ebook':
      return 'needsReview';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

// Falha do fulfillment: so o erro permanente do dominio sai de pendente, porque nova
// consulta nao o resolve. Transitorio e excecao desconhecida seguem pendente.
function mapFulfillmentError(error: unknown): SuccessState {
  if (!(error instanceof EbookFulfillmentError) || error.transient) return 'pending';
  if (error.code === 'EBOOK_FULFILLMENT_SESSION_NOT_FOUND') return 'missingSession';
  return 'needsReview';
}

export async function generateMetadata({
  params,
}: Pick<PageProps, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const entry = resolveEntry(slug);
  if (!entry) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale: EBOOK_LOCALE_TO_APP_LOCALE[entry.locale], namespace: 'ebooks' });

  return {
    title: t('success.metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function EbookSuccessPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const entry = resolveEntry(slug);
  if (!entry) notFound();

  const { session_id } = await searchParams;
  const checkoutSessionId =
    typeof session_id === 'string' && SESSION_ID_PATTERN.test(session_id)
      ? session_id
      : undefined;

  let state: SuccessState;
  if (checkoutSessionId === undefined) {
    // Sem id valido nao ha compra a consultar; nada e chamado nem ecoado.
    state = 'missingSession';
  } else {
    try {
      const deps = buildDefaultEbookFulfillmentDeps();
      const fulfilled = await fulfillEbookCheckoutSession(
        { checkoutSessionId, trigger: 'success_page' },
        deps,
      );
      // Aceito pelo Resend ainda nao e entregue: consulta o status para promover a DELIVERED.
      // Falha da consulta nao desfaz o envio ja aceito: fica o status do fulfillment.
      let result = fulfilled;
      try {
        result = await reconcileEbookDeliveryOnSuccessPage(fulfilled, deps);
      } catch (error) {
        logger.warn('ebook success page: reconcile falhou; mantendo status do fulfillment', {
          slug,
          checkoutSessionId: maskId(checkoutSessionId),
          errorName: error instanceof Error ? error.name : 'unknown',
        });
      }
      state = mapStatus(result.status);
    } catch (error) {
      state = mapFulfillmentError(error);
      logger.warn('ebook success page: fulfillment falhou', {
        slug,
        checkoutSessionId: maskId(checkoutSessionId),
        errorName: error instanceof Error ? error.name : 'unknown',
        code: error instanceof EbookFulfillmentError ? error.code : 'unknown',
        state,
      });
    }
  }

  const t = await getTranslations({ locale: EBOOK_LOCALE_TO_APP_LOCALE[entry.locale], namespace: 'ebooks' });

  let title: string;
  let body: string;
  let recovery: string | undefined;

  switch (state) {
    case 'pending':
      title = t('success.pending.title');
      body = t('success.pending.body');
      break;
    case 'delivered':
      title = t('success.delivered.title');
      body = t('success.delivered.body');
      recovery = t('success.delivered.recovery');
      break;
    case 'failedPayment':
      title = t('success.failedPayment.title');
      body = t('success.failedPayment.body');
      break;
    case 'revoked':
      title = t('success.revoked.title');
      body = t('success.revoked.body');
      break;
    case 'needsReview':
      title = t('success.needsReview.title');
      body = t('success.needsReview.body');
      break;
    case 'missingSession':
      title = t('success.missingSession.title');
      body = t('success.missingSession.body');
      break;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <section data-testid="page-ebooks-success" data-state={state} lang={entry.locale}>
        <h1 data-testid="ebooks-success-title" className="text-2xl font-bold text-foreground">
          {title}
        </h1>
        <p data-testid="ebooks-success-body" className="mt-3 text-base text-muted-foreground">
          {body}
        </p>
        {recovery !== undefined ? (
          <p data-testid="ebooks-success-recovery" className="mt-3 text-sm text-muted-foreground">
            {recovery}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {state === 'pending' && checkoutSessionId !== undefined ? (
            <Link
              data-testid="ebooks-success-retry"
              href={`${ROUTES.EBOOK_SUCCESS(slug)}?session_id=${encodeURIComponent(checkoutSessionId)}`}
              className={cn(buttonVariants())}
            >
              {t('success.retry')}
            </Link>
          ) : null}
          {state === 'delivered' || state === 'revoked' || state === 'needsReview' ? (
            <Link
              data-testid="ebooks-success-contact"
              href={ROUTES.CONTACT}
              className={cn(buttonVariants())}
            >
              {t('success.contact')}
            </Link>
          ) : null}
          {state === 'failedPayment' || state === 'missingSession' ? (
            <Link
              data-testid="ebooks-success-back-to-sale"
              href={ROUTES.EBOOK_DETAIL(slug)}
              className={cn(buttonVariants())}
            >
              {t('success.backToSale')}
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
