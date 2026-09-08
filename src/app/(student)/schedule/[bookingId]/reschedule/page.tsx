import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth/session';
import { rescheduleOptionsService } from '@/lib/bookings/reschedule-options.service';
import {
  RescheduleOptionsClient,
  type RescheduleOptionsClientProps,
} from '@/components/calendar/RescheduleOptionsClient';
import { PageWrapper } from '@/components/shared';
import { ROUTES } from '@/lib/constants/routes';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.reschedule');
  return { title: t('metaTitle'), robots: 'noindex' };
}

interface Props {
  params: Promise<{ bookingId: string }>;
}

/**
 * Fluxo de reagendamento do aluno (ST-09). `bookingId` resolve para
 * `Session.id`. A página carrega as alternativas padronizadas server-side via
 * `rescheduleOptionsService` (mesma autorização do endpoint
 * `/api/v1/bookings/[id]/reschedule/options`) e delega a interação ao
 * `RescheduleOptionsClient`. Todos os estados (forbidden/not_found/invalid_status/
 * server, vazio e ok) são mapeados explicitamente — sem deadends.
 */
export default async function ReschedulePage({ params }: Props) {
  const { bookingId } = await params;
  const t = await getTranslations('pages.reschedule');
  const tA11y = await getTranslations('a11y');

  let view: RescheduleOptionsClientProps;

  if (!bookingId) {
    view = { state: 'error', errorKind: 'not_found' };
  } else {
    const session = await getSession();

    if (!session) {
      // O layout (student) já redireciona não-autenticado; defesa em profundidade.
      view = { state: 'error', errorKind: 'forbidden' };
    } else {
      try {
        const data = await rescheduleOptionsService.getOptions(
          bookingId,
          session.user.id,
          session.user.role,
        );
        view = { state: 'ok', data };
      } catch (error) {
        if (error instanceof AppError) {
          const errorKind =
            error.status === 403
              ? 'forbidden'
              : error.status === 404
                ? 'not_found'
                : error.status === 422
                  ? 'invalid_status'
                  : 'server';
          view = { state: 'error', errorKind };
        } else {
          logger.error(
            'Falha ao carregar opções de reagendamento',
            { bookingId, userId: session.user.id },
            error as Error,
          );
          view = { state: 'error', errorKind: 'server' };
        }
      }
    }
  }

  return (
    <PageWrapper data-testid="page-schedule-reschedule" className="max-w-3xl">
      <nav
        data-testid="schedule-reschedule-breadcrumb"
        aria-label={tA11y('breadcrumb')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link
          data-testid="schedule-reschedule-breadcrumb-history-link"
          href={ROUTES.HISTORY}
          className="transition-colors hover:text-foreground"
        >
          &larr; {t('backHistory')}
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">
          {t('current')}
        </span>
      </nav>

      <header data-testid="schedule-reschedule-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <RescheduleOptionsClient {...view} />
    </PageWrapper>
  );
}
