import type { Metadata } from 'next';
import Link from 'next/link';
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

export const metadata: Metadata = {
  title: 'Reagendar aula',
  robots: 'noindex',
};

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
    <PageWrapper className="max-w-3xl">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href={ROUTES.HISTORY} className="transition-colors hover:text-foreground">
          ← Histórico de aulas
        </Link>
        <span>/</span>
        <span className="text-foreground" aria-current="page">
          Reagendar aula
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Reagendar aula</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Escolha um novo horário entre as alternativas disponíveis.
        </p>
      </header>

      <RescheduleOptionsClient {...view} />
    </PageWrapper>
  );
}
