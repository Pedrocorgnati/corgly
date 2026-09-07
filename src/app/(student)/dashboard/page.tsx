import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calendar, Coins, GraduationCap, ShoppingCart, Zap } from 'lucide-react';
import { DEFAULT_TIMEZONE } from '@/lib/constants';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { CreditWidget } from '@/components/student/credit-widget';
import { NextSessionCard, type NextSessionView } from '@/components/student/next-session-card';
import { QuickStats } from '@/components/student/quick-stats';
import { CorglyCircle } from '@/components/dashboard/CorglyCircle';
import { RecentFeedbackList } from '@/components/dashboard/RecentFeedbackList';
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary';
import { CheckoutSuccessToast } from '@/components/student/checkout-success-toast';
import { SessionErrorToast } from '@/components/student/session-error-toast';
import {
  DashboardHeaderChip,
  DashboardPageHeader,
  PageWrapper,
  WidgetCard,
} from '@/components/shared';
import {
  getDashboardUser,
  getDashboardCredits,
  getDashboardNextSession,
  getDashboardProgress,
  getDashboardRecentFeedbacks,
} from '@/actions/dashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard | Corgly',
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Janela do aviso de expiracao — a mesma de src/components/credits/credit-expiry-alert.tsx. */
const EXPIRY_THRESHOLD_MS = 7 * DAY_MS;
// A janela de "entrar na sala" NAO mora mais aqui: era decidida uma unica vez
// no `Date.now()` do render do servidor e congelava. Quem a avalia agora e o
// proprio card, no relogio do cliente, junto com o contador
// (src/components/student/next-session-card.tsx).

/**
 * Fuso em que a data e a hora da proxima aula sao escritas.
 *
 * A formatacao acontece no SERVIDOR (o card recebe o texto pronto MAIS o ISO
 * cru), entao o fuso tem que ser explicito: sem ele o Node do deploy formata em
 * UTC e a aula das 14h aparece as 17h. `getAuthUser` (src/lib/data/auth.ts) nao
 * devolve `timezone`, entao vale o mesmo fallback de
 * src/lib/bookings/reschedule-options.service.ts.
 */
const DISPLAY_TIMEZONE = DEFAULT_TIMEZONE;

/**
 * Spans da grade. UMA convencao so: a GRADE manda no span, os cards nunca
 * declaram `col-span` por conta propria (antes a pagina abria a grade de 3
 * colunas e os filhos carregavam `lg:col-span-2` fixo, o que deixava buraco).
 *
 * Ordem no DOM: creditos, proxima aula, acoes, historico, circle, avaliacoes.
 *   lg (3 col): [1+1+1] | [3] | [2+1]
 *   md (2 col): [1+1] | [2] | [2] | [2] | [2]
 *   base (1 col): tudo empilhado.
 * Nenhuma linha fica com celula vazia em nenhum breakpoint.
 */
const SPAN = {
  /** Linha inteira no md, um terco no lg. */
  wideThird: 'md:col-span-2 lg:col-span-1',
  /** Linha inteira no md, dois tercos no lg. */
  wideTwoThirds: 'md:col-span-2 lg:col-span-2',
  /** Linha inteira em md e lg. */
  full: 'md:col-span-2 lg:col-span-3',
} as const;

/**
 * Instante desta renderizacao (Server Component: roda uma vez por request).
 *
 * Fica isolado numa funcao porque o lint de pureza do React proibe chamar
 * `Date.now()` direto no corpo do componente. Toda a pagina usa ESTE valor,
 * para que a janela de "entrar na sala", o predicado de expiracao e a contagem
 * de dias enxerguem o mesmo relogio.
 */
function instanteDaRenderizacao(): number {
  return Date.now();
}

export default async function DashboardPage() {
  const [userResult, creditsResult, nextSessionResult, progressResult, recentResult] =
    await Promise.all([
      getDashboardUser(),
      getDashboardCredits(),
      getDashboardNextSession(),
      getDashboardProgress(),
      getDashboardRecentFeedbacks(),
    ]);

  const user = userResult.data;
  const credits = creditsResult.data;
  const progress = progressResult.data;
  const recentFeedbacks = recentResult.data;

  // `data === null` sempre significa FALHA nesta camada (src/actions/dashboard.ts).
  // Creditos e proxima aula tem estado proprio de indisponibilidade: nenhum dos
  // dois pode virar zero/vazio silencioso.
  const creditsUnavailable = credits === null;
  const nextSessionError = nextSessionResult.error;

  // Zero Silencio: painel que falhou nao pode virar "0" silencioso na tela.
  // Cada fetcher devolve `{ data, error }` (src/actions/dashboard.ts) e o erro
  // vira uma faixa nomeando o que nao carregou.
  const failedPanels = [
    { label: 'seu perfil', failed: Boolean(userResult.error) },
    { label: 'créditos', failed: Boolean(creditsResult.error) },
    { label: 'próxima aula', failed: Boolean(nextSessionResult.error) },
    { label: 'progresso', failed: Boolean(progressResult.error) },
    { label: 'avaliações recentes', failed: Boolean(recentResult.error) },
  ]
    .filter((panel) => panel.failed)
    .map((panel) => panel.label);

  // ── Proxima aula ───────────────────────────────────────────────────────────
  // O campo canonico e `startAt` em ISO (produtor: `sessionToMeta`); `scheduledAt`
  // nunca existiu e `new Date(undefined)` renderizava "Invalid Date" sem estourar.
  // O fetcher ja escolheu a aula certa: a EM ANDAMENTO na frente da proxima
  // agendada, descartando o que ja terminou (`endAt <= agora`). Aqui so
  // formatamos. `session: null` = agenda vazia de verdade; falha de leitura
  // viaja em `nextSessionResult.error` e o card tem estado proprio para ela.
  const nextSession = nextSessionResult.data?.session ?? null;
  const nextSessionStartMs = nextSession ? Date.parse(nextSession.startAt) : Number.NaN;
  const hasReadableStart = Number.isFinite(nextSessionStartMs);

  // Data/hora localizadas no SERVIDOR (evita divergencia de fuso na hidratacao),
  // mas o ISO cru viaja junto: e ele que alimenta o contador do card.
  const nextSessionForCard: NextSessionView | null = nextSession
    ? {
        sessionId: nextSession.id,
        startAt: nextSession.startAt,
        // `endAt` fecha a janela de entrada no cliente (a aula em andamento
        // segue acionavel ate o fim); `status` e o que o dialogo de
        // cancelamento le para decidir o aviso de cancelamento tardio.
        endAt: nextSession.endAt,
        status: nextSession.status,
        date: hasReadableStart
          ? new Date(nextSessionStartMs).toLocaleDateString('pt-BR', {
              timeZone: DISPLAY_TIMEZONE,
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })
          : null,
        time: hasReadableStart
          ? new Date(nextSessionStartMs).toLocaleTimeString('pt-BR', {
              timeZone: DISPLAY_TIMEZONE,
              hour: '2-digit',
              minute: '2-digit',
            })
          : null,
      }
    : null;

  const now = instanteDaRenderizacao();

  // ── Creditos a expirar ─────────────────────────────────────────────────────
  // Predicado canonico de src/components/credits/credit-expiry-alert.tsx:
  // expira DENTRO da janela, ainda NAO expirou e sobrou credito no lote.
  // `expiresAt: null` = lote de assinatura, que nao expira — antes disto o
  // `new Date(null)` caia na epoch, passava no teste e o card dizia "0 dia".
  const expiryThreshold = now + EXPIRY_THRESHOLD_MS;
  // `.find()` devolvia o PRIMEIRO lote da lista que caisse na janela — a ordem
  // vem do servico, nao da urgencia. Com dois lotes vencendo (um em 6 dias,
  // outro amanha), o aviso podia dizer "6 dias" e o aluno perdia o credito de
  // amanha. Vence quem expira ANTES.
  const expiringBatch = (credits?.breakdown ?? []).reduce<
    { remaining: number; expiresAtMs: number } | null
  >((maisUrgente, batch) => {
    if (!batch.expiresAt) return maisUrgente;
    const expiresAtMs = new Date(batch.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) return maisUrgente;
    const dentroDaJanela =
      batch.remaining > 0 && expiresAtMs > now && expiresAtMs <= expiryThreshold;
    if (!dentroDaJanela) return maisUrgente;
    if (maisUrgente && maisUrgente.expiresAtMs <= expiresAtMs) return maisUrgente;
    return { remaining: batch.remaining, expiresAtMs };
  }, null);
  const expiringCount = expiringBatch?.remaining ?? 0;
  const expiringDays = expiringBatch
    ? Math.max(1, Math.ceil((expiringBatch.expiresAtMs - now) / DAY_MS))
    : 0;

  // ── Corgly Circle ──────────────────────────────────────────────────────────
  // Vocabulario real do backend: listening/speaking/writing/vocabulary.
  const averageScores = progress?.averageScores ?? null;
  const hasScores =
    averageScores !== null &&
    (averageScores.listening > 0 ||
      averageScores.speaking > 0 ||
      averageScores.writing > 0 ||
      averageScores.vocabulary > 0);
  const circleScores = hasScores ? averageScores : null;

  // ── Historico ──────────────────────────────────────────────────────────────
  const totalSessions = progress?.totalSessions ?? 0;
  const completedSessions = progress?.completedSessions ?? 0;
  const completedPercent =
    totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  const feedbackList = (recentFeedbacks?.items ?? []).map((fb) => ({
    id: fb.id,
    sessionDate: fb.sessionDate,
    averageScore: fb.averageScore,
    sessionId: fb.sessionId,
  }));

  // Chips do cabecalho: "nao consegui saber" nunca vira um numero.
  const creditsChipLabel = creditsUnavailable
    ? 'Créditos indisponíveis'
    : `${credits.balance} credito${credits.balance === 1 ? '' : 's'}`;

  const nextSessionChipLabel = nextSessionError
    ? 'Agenda indisponível'
    : nextSessionForCard
      ? nextSessionForCard.time
        ? `Próxima: ${nextSessionForCard.time}`
        : 'Horário a confirmar'
      : 'Sem aula agendada';

  return (
    <PageWrapper data-testid="page-dashboard">
      <Suspense fallback={null}>
        <CheckoutSuccessToast />
      </Suspense>
      <Suspense fallback={null}>
        <SessionErrorToast />
      </Suspense>

      {/* Saudacao na faixa lilas do hero da landing */}
      <DashboardPageHeader
        data-testid="dashboard-header"
        eyebrow="Sua jornada Corgly"
        title={`Ola, ${user?.name ?? 'Estudante'}!`}
        subtitle="Bem-vinda de volta a sua jornada de aprendizado."
        chips={
          <>
            <DashboardHeaderChip icon={Coins} data-testid="dashboard-header-chip-credits">
              {creditsChipLabel}
            </DashboardHeaderChip>
            <DashboardHeaderChip icon={Calendar} data-testid="dashboard-header-chip-next-session">
              {nextSessionChipLabel}
            </DashboardHeaderChip>
            <DashboardHeaderChip icon={GraduationCap} data-testid="dashboard-header-chip-sessions">
              {completedSessions} aula{completedSessions === 1 ? '' : 's'} concluida{completedSessions === 1 ? '' : 's'}
            </DashboardHeaderChip>
          </>
        }
        actions={
          <Link
            href={ROUTES.SCHEDULE}
            data-testid="dashboard-header-schedule-button"
            className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-lg bg-white px-5 text-[14.5px] font-semibold text-[#5b4a9a] shadow-[0_8px_24px_rgba(80,50,130,0.18)] transition-colors hover:bg-white/90"
          >
            <Calendar className="h-4 w-4" />
            Agendar aula
          </Link>
        }
      />

      {failedPanels.length > 0 && (
        <div
          data-testid="dashboard-data-error"
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[13.5px] text-ink">
            Não conseguimos carregar {failedPanels.join(', ')}. Os cartões abaixo podem estar
            incompletos.{' '}
            <a
              href={ROUTES.DASHBOARD}
              data-testid="dashboard-data-error-retry-button"
              className="font-semibold text-brand-500 hover:underline"
            >
              Tentar de novo
            </a>
          </p>
        </div>
      )}

      {/* Grade unica: 1 / 2 / 3 colunas. Os spans vem daqui (ver SPAN). */}
      <div data-testid="dashboard-kpis" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 1. Creditos */}
        <WidgetErrorBoundary label="creditos">
          {creditsUnavailable ? (
            // Saldo desconhecido NAO e saldo zero. `credits?.balance ?? 0` pintava
            // "0 creditos" e o aluno com saldo achava que tinha perdido tudo — e,
            // pior, ia comprar de novo. Aqui a tela diz o que aconteceu e oferece
            // as duas saidas reais: recarregar ou abrir a pagina de creditos.
            <WidgetCard
              data-testid="dashboard-kpi-credits-unavailable"
              title="Créditos"
              icon={Coins}
              accent="amber"
            >
              <div role="alert" className="flex-1">
                <p className="text-[13.5px] font-semibold text-ink">
                  Não foi possível ler seu saldo
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  {creditsResult.error ?? 'Tente de novo em instantes.'}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={ROUTES.DASHBOARD}
                  data-testid="dashboard-kpi-credits-retry-button"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'flex-1 h-11 min-h-[44px] rounded-lg font-semibold',
                  )}
                >
                  Tentar de novo
                </a>
                <Link
                  href={ROUTES.CREDITS}
                  data-testid="dashboard-kpi-credits-open-button"
                  className={cn(buttonVariants(), 'flex-1 h-11 min-h-[44px] rounded-lg font-semibold')}
                >
                  Ver créditos
                </Link>
              </div>
            </WidgetCard>
          ) : (
            <CreditWidget
              balance={credits.balance}
              expiringCount={expiringCount}
              expiringDays={expiringDays}
            />
          )}
        </WidgetErrorBoundary>

        {/* 2. Proxima aula */}
        <WidgetErrorBoundary label="proxima-aula">
          <NextSessionCard session={nextSessionForCard} loadError={nextSessionError} />
        </WidgetErrorBoundary>

        {/* 3. Acoes rapidas */}
        <WidgetCard
          data-testid="dashboard-quick-actions"
          title="Ações rápidas"
          icon={Zap}
          className={SPAN.wideThird}
        >
          <div className="flex flex-col gap-3">
            <Link
              href={ROUTES.SCHEDULE}
              data-testid="dashboard-schedule-lesson-button"
              className={cn(buttonVariants(), 'w-full h-11 min-h-[44px] rounded-lg justify-start font-semibold')}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Agendar aula
            </Link>
            <Link
              href={ROUTES.CREDITS}
              data-testid="dashboard-buy-credits-button"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'w-full h-11 min-h-[44px] rounded-lg justify-start font-semibold border-[1.5px] border-brand-500 text-brand-500 hover:bg-brand-500/5',
              )}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Comprar creditos
            </Link>
          </div>
        </WidgetCard>

        {/* 4. Historico */}
        <WidgetErrorBoundary label="historico" className={SPAN.full}>
          {/*
            `streak` fica de fora: nao existe fonte de sequencia semanal ligada
            ao dashboard. O valor anterior (`completedSessions`) era o total de
            aulas concluidas rotulado como "Sequencia (sem.)" — numero errado
            com nome de outra metrica. Sem fonte, o widget omite a metrica.
          */}
          <QuickStats
            total={totalSessions}
            completedPercent={completedPercent}
            className={SPAN.full}
          />
        </WidgetErrorBoundary>

        {/* 5. Corgly Circle */}
        <WidgetErrorBoundary label="corgly-circle" className={SPAN.wideTwoThirds}>
          <CorglyCircle scores={circleScores} isLoading={false} className={SPAN.wideTwoThirds} />
        </WidgetErrorBoundary>

        {/* 6. Avaliacoes recentes */}
        <WidgetErrorBoundary label="avaliacoes-recentes" className={SPAN.wideThird}>
          <RecentFeedbackList
            feedbacks={feedbackList}
            isLoading={false}
            className={SPAN.wideThird}
          />
        </WidgetErrorBoundary>
      </div>
    </PageWrapper>
  );
}
