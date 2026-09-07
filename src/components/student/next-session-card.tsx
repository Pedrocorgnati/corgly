'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AlertTriangle, Calendar, Loader2, WifiOff } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { WidgetCard } from '@/components/shared/widget-card';
import { CancelConfirmDialog } from '@/components/calendar/CancelConfirmDialog';
import { canEnter } from '@/lib/session/canEnter';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

/**
 * Recorte da proxima aula consumido por este card.
 *
 * `startAt`/`endAt` sao os ISO 8601 CRUS que a API devolve (produtor:
 * `sessionToMeta` em src/services/session.service.ts). Sao eles — e so eles —
 * que alimentam o relogio: a versao anterior montava o alvo com
 * `${date}T${time}` a partir das strings ja localizadas ("segunda-feira, 08 de
 * setembro"), o que dava `NaN` e imprimia "NaN:NaN:NaN" para sempre.
 *
 * `date`/`time` chegam ja formatados do servidor de proposito: formatar no
 * cliente divergiria de fuso/locale entre o SSR e a hidratacao. Sao `null`
 * quando o `startAt` nao e parseavel — o card mostra estado de erro legivel.
 */
export interface NextSessionView {
  sessionId: string;
  /** ISO 8601 (UTC) do inicio da aula. */
  startAt: string;
  /** ISO 8601 (UTC) do fim da aula. Fecha a janela de entrada. */
  endAt: string;
  /** Status vindo da API — o dialogo de cancelamento decide o texto com ele. */
  status: string;
  /** Data localizada no servidor, ou `null` se `startAt` for ilegivel. */
  date: string | null;
  /** Hora localizada no servidor, ou `null` se `startAt` for ilegivel. */
  time: string | null;
}

interface NextSessionCardProps {
  session: NextSessionView | null;
  /**
   * Mensagem do fetcher quando a agenda NAO pode ser lida.
   * Produtor: `getDashboardNextSession().error` (src/actions/dashboard.ts).
   * Falha e ausencia sao estados DIFERENTES: dizer "nenhuma aula agendada"
   * quando a API caiu e mentir para quem tem aula marcada.
   */
  loadError?: string | null;
}

const COUNTDOWN_TESTID = 'dashboard-next-session-countdown';
const CLOCK_CLASS =
  'text-[2rem] font-mono font-semibold tracking-tight text-brand-500 text-center leading-none';
const ACTION_ROW_CLASS = 'flex gap-2 mt-auto';

/**
 * Quem decide se a sala esta aberta e `canEnter` (src/lib/session/canEnter.ts) —
 * a MESMA regra usada pelo lobby, pelo pre-check e pela rota que so entrega os
 * `iceServers` quando ela passa (src/app/api/v1/sessions/[id]/route.ts). O card
 * tinha uma janela propria de 15 min: destravava "Entrar" dez minutos antes da
 * sala existir de verdade e o aluno caia num lobby que mandava esperar.
 *
 * O que e novo aqui e QUANDO a regra e avaliada: a cada segundo, no relogio do
 * cliente. Antes ela era decidida uma unica vez no `Date.now()` do render do
 * servidor, entao quem deixava a aba aberta ficava com o botao travado depois da
 * hora chegar, ate recarregar a pagina na mao.
 */

/** Fases visiveis do card. Cada uma tem relogio e acoes proprias. */
type SessionPhase = 'ilegivel' | 'medindo' | 'aguardando' | 'aovivo' | 'encerrada';

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
 * Relogio do cliente, um tick por segundo.
 *
 * Devolve `null` enquanto ainda nao medimos no navegador. Medir no render do
 * servidor daria mismatch de hidratacao (o relogio anda entre os dois paints),
 * entao o primeiro paint e explicitamente "medindo" em vez de um palpite.
 */
function useAgora(ativo: boolean): number | null {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const tick = () => setAgora(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ativo]);

  return agora;
}

/** Casca comum: mesmo cabecalho em qualquer estado do card. */
function NextSessionShell({ children }: { children: React.ReactNode }) {
  return (
    <WidgetCard data-testid="dashboard-kpi-next-session" title="Próxima aula" icon={Calendar}>
      {children}
    </WidgetCard>
  );
}

/**
 * Falha de leitura da agenda. NUNCA colapsar com o estado vazio: aqui o aluno
 * pode ter aula sim, nos e que nao conseguimos ler.
 */
function NextSessionErrorState({ message }: { message: string }) {
  const t = useTranslations('dashboard.nextSession.error');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <NextSessionShell>
      <div
        data-testid="dashboard-next-session-error"
        role="alert"
        className="flex-1 flex flex-col items-center justify-center py-4 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-warning/50 text-warning mb-3">
          <WifiOff className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-[13.5px] font-semibold text-ink">{t('title')}</p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t('description')}</p>
        <p className="mt-1 text-[12px] text-muted-foreground/80">{message}</p>
      </div>

      <div className={ACTION_ROW_CLASS}>
        <Button
          data-testid="dashboard-next-session-error-retry-button"
          variant="ghost"
          size="sm"
          className="flex-1 rounded-lg"
          disabled={isPending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              {t('retrying')}
            </>
          ) : (
            t('retry')
          )}
        </Button>
        <Link
          href={ROUTES.HISTORY}
          data-testid="dashboard-next-session-error-history-button"
          className={cn(buttonVariants({ size: 'sm' }), 'flex-1 rounded-lg font-semibold')}
        >
          {t('viewHistory')}
        </Link>
      </div>
    </NextSessionShell>
  );
}

/** Agenda lida com sucesso e vazia — fato, nao suspeita. */
function NextSessionEmptyState() {
  return (
    <NextSessionShell>
      <div
        data-testid="dashboard-next-session-empty"
        className="flex-1 flex flex-col items-center justify-center py-6 text-muted-foreground"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 text-brand-500 mb-3">
          <Calendar className="h-5 w-5" aria-hidden="true" />
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
    </NextSessionShell>
  );
}

/**
 * Aula existente. Toda a leitura de tempo e do CLIENTE e reavaliada a cada
 * segundo: relogio, janela de entrada e fim da aula saem do mesmo tick.
 */
function NextSessionContent({ session }: { session: NextSessionView }) {
  const t = useTranslations('dashboard.nextSession');
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  const inicioMs = Date.parse(session.startAt);
  const fimMs = Date.parse(session.endAt);
  const inicioLegivel = Number.isFinite(inicioMs);
  const fimLegivel = Number.isFinite(fimMs);

  const agora = useAgora(inicioLegivel);

  let fase: SessionPhase;
  if (!inicioLegivel) {
    fase = 'ilegivel';
  } else if (agora === null) {
    fase = 'medindo';
  } else if (fimLegivel && agora >= fimMs) {
    fase = 'encerrada';
  } else if (agora >= inicioMs) {
    fase = 'aovivo';
  } else {
    fase = 'aguardando';
  }

  // A sala abre pela regra canonica e fecha no fim da aula (`endAt`). Sem o
  // segundo corte, o botao continuaria aceso horas depois do fim, porque
  // `canEnter` so olha para o inicio.
  const podeEntrar =
    agora !== null &&
    inicioLegivel &&
    fase !== 'encerrada' &&
    canEnter({ startAt: session.startAt }, new Date(agora));

  const atualizar = () => startRefresh(() => router.refresh());

  return (
    <NextSessionShell>
      <p className="text-[1.15rem] font-semibold text-ink leading-tight">
        {session.date ?? 'Data a confirmar'}
      </p>
      <p className="text-[13px] text-muted-foreground mb-4">
        {session.time ?? 'Horário a confirmar'}
      </p>

      {fase === 'ilegivel' && (
        <p
          data-testid={COUNTDOWN_TESTID}
          role="status"
          className="flex items-center justify-center gap-1.5 text-center text-[13.5px] font-medium text-warning"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Horário indisponível
        </p>
      )}
      {fase === 'medindo' && (
        <p data-testid={COUNTDOWN_TESTID} role="timer" aria-live="off" className={CLOCK_CLASS}>
          --:--:--
        </p>
      )}
      {fase === 'aguardando' && agora !== null && (
        <p data-testid={COUNTDOWN_TESTID} role="timer" aria-live="off" className={CLOCK_CLASS}>
          {formatRemaining(inicioMs - agora)}
        </p>
      )}
      {fase === 'aovivo' && (
        <p
          data-testid={COUNTDOWN_TESTID}
          role="status"
          className="animate-pulse text-center font-semibold text-success"
        >
          Sessão ao vivo!
        </p>
      )}
      {fase === 'encerrada' && (
        <p
          data-testid={COUNTDOWN_TESTID}
          role="status"
          className="text-center font-semibold text-muted-foreground"
        >
          {t('ended.clock')}
        </p>
      )}

      {fase === 'ilegivel' ? (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">
          Não conseguimos ler o horário desta aula.{' '}
          <Link href={ROUTES.HISTORY} className="font-semibold text-brand-500 hover:underline">
            Conferir no histórico
          </Link>
        </p>
      ) : fase === 'encerrada' ? (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">
          {t('ended.hint')}
        </p>
      ) : fase === 'aovivo' ? (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">
          a aula já começou
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground text-center mt-1.5 mb-5">até a aula</p>
      )}

      {fase === 'encerrada' ? (
        <div className={ACTION_ROW_CLASS}>
          <Button
            data-testid="dashboard-next-session-refresh-button"
            variant="ghost"
            size="sm"
            className="flex-1 rounded-lg"
            disabled={isRefreshing}
            onClick={atualizar}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                {t('ended.refreshing')}
              </>
            ) : (
              t('ended.refresh')
            )}
          </Button>
          <Link
            href={ROUTES.HISTORY}
            data-testid="dashboard-next-session-history-button"
            className={cn(buttonVariants({ size: 'sm' }), 'flex-1 rounded-lg font-semibold')}
          >
            {t('ended.viewHistory')}
          </Link>
        </div>
      ) : (
        <div className={ACTION_ROW_CLASS}>
          {/* Zero Orfaos: o botao abre o MESMO dialogo de confirmacao que o
              historico usa (src/components/calendar/CancelConfirmDialog.tsx ->
              `cancelSession` -> PATCH /api/v1/sessions/[id]/cancel). Antes ele
              so navegava para `/schedule?cancel=<id>`, parametro que nenhuma
              tela do repositorio le: o aluno saia achando que cancelou e a aula
              seguia marcada, consumindo o credito. */}
          <Button
            data-testid="dashboard-next-session-cancel-button"
            variant="ghost"
            size="sm"
            className="flex-1 rounded-lg"
            disabled={fase === 'ilegivel'}
            onClick={() => setCancelOpen(true)}
          >
            Cancelar
          </Button>
          {podeEntrar ? (
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
              title={
                fase === 'medindo'
                  ? 'Verificando o horário de abertura da sala...'
                  : 'A sala abre 5 minutos antes do início da aula.'
              }
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
      )}

      {cancelOpen && (
        <CancelConfirmDialog
          session={{ id: session.sessionId, startAt: session.startAt, status: session.status }}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onCancelled={() => {
            setCancelOpen(false);
            // O server action revalida /history e /schedule, nao /dashboard.
            // `refresh()` refaz esta rota (force-dynamic) e o card some/atualiza.
            router.refresh();
          }}
        />
      )}
    </NextSessionShell>
  );
}

/**
 * Card "Proxima aula".
 *
 * Tres entradas mutuamente exclusivas, nesta ordem (Zero Estados Indefinidos):
 * falha de leitura > agenda vazia > aula. O despacho fica sem hooks de proposito
 * — cada estado tem os seus, e trocar de estado nao pode mudar a ordem deles.
 */
export function NextSessionCard({ session, loadError = null }: NextSessionCardProps) {
  if (loadError) {
    return <NextSessionErrorState message={loadError} />;
  }

  if (!session) {
    return <NextSessionEmptyState />;
  }

  return <NextSessionContent session={session} />;
}
