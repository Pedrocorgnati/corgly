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
/** Antecedencia em que o botao "Entrar" da sala destrava. */
const ENTER_WINDOW_MS = 15 * 60 * 1000;

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
  const nextSessionData = nextSessionResult.data;
  const progress = progressResult.data;
  const recentFeedbacks = recentResult.data;

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
  // A API ja devolve a aula mais proxima: status=SCHEDULED + from=agora +
  // sort=startAt:asc + limit=1.
  const nextSession = nextSessionData?.data?.[0] ?? null;
  const nextSessionStartMs = nextSession ? Date.parse(nextSession.startAt) : Number.NaN;
  const hasReadableStart = Number.isFinite(nextSessionStartMs);

  // Data/hora localizadas no SERVIDOR (evita divergencia de fuso na hidratacao),
  // mas o ISO cru viaja junto: e ele que alimenta o contador do card.
  const nextSessionForCard: NextSessionView | null = nextSession
    ? {
        sessionId: nextSession.id,
        startAt: nextSession.startAt,
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
  const canEnter = hasReadableStart && nextSessionStartMs - now <= ENTER_WINDOW_MS;

  // ── Creditos a expirar ─────────────────────────────────────────────────────
  // Predicado canonico de src/components/credits/credit-expiry-alert.tsx:
  // expira DENTRO da janela, ainda NAO expirou e sobrou credito no lote.
  // `expiresAt: null` = lote de assinatura, que nao expira — antes disto o
  // `new Date(null)` caia na epoch, passava no teste e o card dizia "0 dia".
  const balance = credits?.balance ?? 0;
  const expiryThreshold = now + EXPIRY_THRESHOLD_MS;
  const expiringBatch = (credits?.breakdown ?? []).find((batch) => {
    if (!batch.expiresAt) return false;
    const expiresAt = new Date(batch.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) return false;
    return batch.remaining > 0 && expiresAt > now && expiresAt <= expiryThreshold;
  });
  const expiringCount = expiringBatch?.remaining ?? 0;
  const expiringDays = expiringBatch?.expiresAt
    ? Math.max(1, Math.ceil((new Date(expiringBatch.expiresAt).getTime() - now) / DAY_MS))
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

  const nextSessionChipLabel = nextSessionForCard
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
              {balance} credito{balance === 1 ? '' : 's'}
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
        <WidgetErrorBoundary>
          <CreditWidget
            balance={balance}
            expiringCount={expiringCount}
            expiringDays={expiringDays}
          />
        </WidgetErrorBoundary>

        {/* 2. Proxima aula */}
        <WidgetErrorBoundary>
          <NextSessionCard session={nextSessionForCard} canEnter={canEnter} />
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
        <WidgetErrorBoundary>
          <QuickStats
            total={totalSessions}
            completedPercent={completedPercent}
            streak={completedSessions}
            className={SPAN.full}
          />
        </WidgetErrorBoundary>

        {/* 5. Corgly Circle */}
        <WidgetErrorBoundary>
          <CorglyCircle scores={circleScores} isLoading={false} className={SPAN.wideTwoThirds} />
        </WidgetErrorBoundary>

        {/* 6. Avaliacoes recentes */}
        <WidgetErrorBoundary>
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
