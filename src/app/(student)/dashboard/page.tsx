import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Calendar, ShoppingCart } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CreditWidget } from '@/components/student/credit-widget';
import { NextSessionCard } from '@/components/student/next-session-card';
import { QuickStats } from '@/components/student/quick-stats';
import { CorglyCircle } from '@/components/dashboard/CorglyCircle';
import { RecentFeedbackList } from '@/components/dashboard/RecentFeedbackList';
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary';
import { CheckoutSuccessToast } from '@/components/student/checkout-success-toast';
import { SessionErrorToast } from '@/components/student/session-error-toast';
import { PageWrapper } from '@/components/shared';
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

const EXPIRY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function CreditWidgetSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-10 w-16 mx-auto mb-2" />
      <Skeleton className="h-3 w-12 mx-auto mb-4" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function NextSessionSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-6 w-32 mb-2" />
      <Skeleton className="h-4 w-20 mb-3" />
      <Skeleton className="h-8 w-24 mx-auto mb-4" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function QuickStatsSkeleton() {
  return (
    <div className="md:col-span-2 lg:col-span-3 bg-card border border-border rounded-xl p-5 shadow-sm">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <Skeleton className="h-8 w-12 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
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

  // Extract first scheduled session
  const nextSession = nextSessionData?.data?.[0] ?? null;

  // Format next session for the card
  const nextSessionForCard = nextSession
    ? {
        date: new Date(nextSession.scheduledAt).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        }),
        time: new Date(nextSession.scheduledAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        sessionId: nextSession.id,
      }
    : null;

  // Determine if session can be entered (within 15 min window)
  const canEnter = nextSession
    ? new Date(nextSession.scheduledAt).getTime() - Date.now() <= 15 * 60 * 1000
    : false;

  // Credit expiring logic
  const balance = credits?.balance ?? 0;
  const expiringBatch = credits?.breakdown?.find((batch) => {
    const expiresAt = new Date(batch.expiresAt).getTime();
    return batch.remaining > 0 && expiresAt < Date.now() + EXPIRY_THRESHOLD_MS;
  });
  const expiringCount = expiringBatch?.remaining ?? 0;
  const expiringDays = expiringBatch
    ? Math.max(0, Math.ceil((new Date(expiringBatch.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // CorglyCircle scores — null if no feedback yet
  const hasScores =
    progress?.averageScores &&
    (progress.averageScores.listening > 0 ||
      progress.averageScores.speaking > 0 ||
      progress.averageScores.writing > 0 ||
      progress.averageScores.vocabulary > 0);
  const circleScores = hasScores ? progress!.averageScores : null;

  // Stats
  const totalSessions = progress?.totalSessions ?? 0;
  const completedSessions = progress?.completedSessions ?? 0;
  const completedPercent = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const streak = user?.creditBalance ?? 0; // streak not available from current APIs; fallback

  // Recent feedbacks for list
  const feedbackList = (recentFeedbacks?.items ?? []).map((fb) => ({
    id: fb.id,
    sessionDate: fb.sessionDate,
    averageScore: fb.averageScore,
    sessionId: fb.sessionId,
  }));

  return (
    <PageWrapper className="max-w-5xl">
      <Suspense fallback={null}>
        <CheckoutSuccessToast />
      </Suspense>
      <Suspense fallback={null}>
        <SessionErrorToast />
      </Suspense>

      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Ola, {user?.name ?? 'Estudante'}!
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bem-vinda de volta a sua jornada de aprendizado.
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Widget 1: Credits */}
        <WidgetErrorBoundary>
          <CreditWidget
            balance={balance}
            expiringCount={expiringCount}
            expiringDays={expiringDays}
          />
        </WidgetErrorBoundary>

        {/* Widget 2: Next session */}
        <WidgetErrorBoundary>
          <NextSessionCard session={nextSessionForCard} canEnter={canEnter} />
        </WidgetErrorBoundary>

        {/* Widget 3: Corgly Circle */}
        <WidgetErrorBoundary>
          <CorglyCircle scores={circleScores} isLoading={false} />
        </WidgetErrorBoundary>

        {/* Widget 4: Quick Stats */}
        <WidgetErrorBoundary>
          <QuickStats
            total={totalSessions}
            completedPercent={completedPercent}
            streak={completedSessions}
            className="md:col-span-2 lg:col-span-3"
          />
        </WidgetErrorBoundary>

        {/* Widget 5: Recent Feedback */}
        <WidgetErrorBoundary>
          <RecentFeedbackList feedbacks={feedbackList} isLoading={false} />
        </WidgetErrorBoundary>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-3">Ações rápidas</h2>
          <div className="flex flex-col gap-3">
            <Link href={ROUTES.SCHEDULE} className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-start')}>
              <Calendar className="h-4 w-4 mr-2" />
              Agendar aula
            </Link>
            <Link href={ROUTES.CREDITS} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-start')}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Comprar creditos
            </Link>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
