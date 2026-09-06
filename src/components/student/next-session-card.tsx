'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Calendar } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { WidgetCard } from '@/components/shared/widget-card';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

/**
 * Recorte da proxima aula consumido por este card.
 *
 * `startAt` e o ISO 8601 CRU que a API devolve (produtor: `sessionToMeta` em
 * src/services/session.service.ts). E ele — e SO ele — que alimenta o contador:
 * a versao anterior montava o alvo com `${date}T${time}` a partir das strings ja
 * localizadas ("segunda-feira, 08 de setembro"), o que dava `NaN` e imprimia
 * "NaN:NaN:NaN" para sempre.
 *
 * `date`/`time` chegam ja formatados do servidor de proposito: formatar no
 * cliente divergiria de fuso/locale entre o SSR e a hidratacao. Sao `null`
 * quando o `startAt` nao e parseavel — o card mostra estado de erro legivel.
 */
export interface NextSessionView {
  sessionId: string;
  /** ISO 8601 (UTC) do inicio da aula. */
  startAt: string;
  /** Data localizada no servidor, ou `null` se `startAt` for ilegivel. */
  date: string | null;
  /** Hora localizada no servidor, ou `null` se `startAt` for ilegivel. */
  time: string | null;
}

interface NextSessionCardProps {
  session: NextSessionView | null;
  canEnter?: boolean;
}

const COUNTDOWN_TESTID = 'dashboard-next-session-countdown';
const CLOCK_CLASS =
  'text-[2rem] font-mono font-semibold tracking-tight text-brand-500 text-center leading-none';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ms restantes -> "hh:mm:ss", com prefixo de dias quando falta mais de 24h. */
function formatRemaining(diffMs: number): string {
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const clock = `${pad(Math.floor((totalSeconds % 86_400) / 3600))}:${pad(
    Math.floor((totalSeconds % 3600) / 60),
  )}:${pad(totalSeconds % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Contador regressivo ate o inicio da aula.
 *
 * Tres estados explicitos (Zero Estados Indefinidos):
 *  - ilegivel: `startAt` nao parseia -> aviso legivel, nunca "NaN:NaN:NaN";
 *  - pendente: primeiro paint (servidor/hidratacao), sem relogio do cliente;
 *  - contando / ao vivo: diferenca positiva ou <= 0.
 */
function Countdown({ startAt }: { startAt: string }) {
  const targetMs = Date.parse(startAt);
  const isReadable = Number.isFinite(targetMs);
  // `null` = ainda nao medimos no cliente. Medir no render do servidor daria
  // mismatch de hidratacao (o relogio anda entre os dois paints).
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isReadable) return;
    const tick = () => setRemainingMs(targetMs - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isReadable, targetMs]);

  if (!isReadable) {
    return (
      <p
        data-testid={COUNTDOWN_TESTID}
        role="status"
        className="flex items-center justify-center gap-1.5 text-center text-[13.5px] font-medium text-warning"
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        Horário indisponível
      </p>
    );
  }

  if (remainingMs === null) {
    return (
      <p data-testid={COUNTDOWN_TESTID} role="timer" aria-live="off" className={CLOCK_CLASS}>
        --:--:--
      </p>
    );
  }

  if (remainingMs <= 0) {
    return (
      <p
        data-testid={COUNTDOWN_TESTID}
        role="status"
        className="animate-pulse text-center font-semibold text-success"
      >
        Sessão ao vivo!
      </p>
    );
  }

  return (
    <p data-testid={COUNTDOWN_TESTID} role="timer" aria-live="off" className={CLOCK_CLASS}>
      {formatRemaining(remainingMs)}
    </p>
  );
}

export function NextSessionCard({ session, canEnter = true }: NextSessionCardProps) {
  const router = useRouter();

  if (!session) {
    return (
      <WidgetCard data-testid="dashboard-kpi-next-session" title="Próxima aula" icon={Calendar}>
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-muted-foreground">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 text-brand-500 mb-3">
            <Calendar className="h-5 w-5" />
          </span>
          <p className="text-[13.5px] text-center">Nenhuma aula agendada</p>
        </div>
        <Link
          href={ROUTES.SCHEDULE}
          data-testid="dashboard-next-session-schedule-button"
          className={cn(buttonVariants(), 'w-full mt-auto h-11 min-h-[44px] rounded-lg font-semibold')}
        >
          + Agendar nova aula
        </Link>
      </WidgetCard>
    );
  }

  const isReadable = Number.isFinite(Date.parse(session.startAt));

  return (
    <WidgetCard data-testid="dashboard-kpi-next-session" title="Próxima aula" icon={Calendar}>
      <p className="text-[1.15rem] font-semibold text-ink leading-tight">
        {session.date ?? 'Data a confirmar'}
      </p>
      <p className="text-[13px] text-muted-foreground mb-4">
        {session.time ?? 'Horário a confirmar'}
      </p>

      <Countdown startAt={session.startAt} />

      {isReadable ? (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">até a aula</p>
      ) : (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">
          Não conseguimos ler o horário desta aula.{' '}
          <Link href={ROUTES.SCHEDULE} className="font-semibold text-brand-500 hover:underline">
            Conferir na agenda
          </Link>
        </p>
      )}

      <div className="flex gap-2 mt-auto">
        <Button
          data-testid="dashboard-next-session-cancel-button"
          variant="ghost"
          size="sm"
          className="flex-1 rounded-lg"
          onClick={() => router.push(`/schedule?cancel=${session.sessionId}`)}
        >
          Cancelar
        </Button>
        {canEnter ? (
          <Link
            href={ROUTES.SESSION_LOBBY(session.sessionId)}
            data-testid="dashboard-next-session-enter-button"
            className={cn(buttonVariants({ size: 'sm' }), 'flex-1 rounded-lg font-semibold')}
          >
            Entrar &rarr;
          </Link>
        ) : (
          <span
            role="link"
            aria-disabled="true"
            data-testid="dashboard-next-session-enter-button"
            className={cn(
              buttonVariants({ size: 'sm' }),
              'flex-1 rounded-lg font-semibold opacity-50 cursor-not-allowed pointer-events-none',
            )}
          >
            Entrar &rarr;
          </span>
        )}
      </div>
    </WidgetCard>
  );
}
