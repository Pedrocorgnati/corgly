import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, ShoppingCart } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CreditWidget } from '@/components/student/credit-widget';
import { NextSessionCard } from '@/components/student/next-session-card';
import { QuickStats } from '@/components/student/quick-stats';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// TODO: Replace with real session auth
const MOCK_USER = {
  name: 'Ana',
  creditBalance: 0,
  expiringCredits: { count: 0, daysUntilExpiry: 0 },
  nextSession: null as null | { date: string; time: string; sessionId: string },
  stats: { total: 0, completed: 0, streak: 0 },
  recentFeedback: [] as Array<{ date: string; score: number; sessionId: string }>,
};

export default function DashboardPage() {
  const user = MOCK_USER;

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {user.name}!
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bem-vinda de volta à sua jornada de aprendizado.
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Widget 1: Credits */}
        <CreditWidget
          balance={user.creditBalance}
          expiringCount={user.expiringCredits.count}
          expiringDays={user.expiringCredits.daysUntilExpiry}
        />

        {/* Widget 2: Next session */}
        <NextSessionCard session={user.nextSession} />

        {/* Widget 3: Corgly Circle */}
        <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground mb-4">Corgly Circle</p>
          <div className="flex items-center justify-center h-[220px] border-2 border-dashed border-border rounded-xl">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Complete suas primeiras sessões</p>
              <p className="text-xs mt-1">O gráfico de progresso aparecerá aqui</p>
            </div>
          </div>
          <Link href={ROUTES.PROGRESS} className="text-primary text-sm font-medium hover:underline mt-3 block">
            Ver progresso completo →
          </Link>
        </div>

        {/* Widget 4: Quick Stats */}
        <QuickStats
          total={user.stats.total}
          completedPercent={user.stats.completed}
          streak={user.stats.streak}
          className="md:col-span-2 lg:col-span-3"
        />

        {/* Widget 5: Recent Feedback */}
        <div className="md:col-span-2 lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground mb-4">Avaliações Recentes</p>
          {user.recentFeedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma avaliação ainda</p>
              <p className="text-xs mt-1">Complete uma aula para ver seu feedback aqui</p>
            </div>
          ) : (
            <div className="space-y-2">
              {user.recentFeedback.map((fb) => (
                <div key={fb.sessionId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <span className="text-sm text-foreground">{fb.date}</span>
                  <Badge variant="outline" className={
                    fb.score >= 4 ? 'bg-green-50 text-[#059669] border-green-200' :
                    fb.score >= 3 ? 'bg-amber-50 text-[#D97706] border-amber-200' :
                    'bg-red-50 text-destructive border-red-200'
                  }>
                    ★ {fb.score.toFixed(1)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <Link href={ROUTES.HISTORY} className="text-primary text-sm font-medium hover:underline mt-3 block">
            Ver tudo →
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-3">Ações rápidas</h3>
          <div className="flex flex-col gap-3">
            <Link href={ROUTES.SCHEDULE} className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-start')}>
              <Calendar className="h-4 w-4 mr-2" />
              Agendar aula
            </Link>
            <Link href={ROUTES.CREDITS} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-start')}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Comprar créditos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
