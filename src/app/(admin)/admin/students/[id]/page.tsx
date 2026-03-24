import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  CreditCard,
  Calendar,
  CheckCircle,
  XCircle,
  Star,
  MessageSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAdminStudentDetail } from '@/actions/admin-students';
import { ROUTES } from '@/lib/constants/routes';
import { formatDatePtBR, formatDateTimePtBR } from '@/lib/format-datetime';
import { PageWrapper } from '@/components/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Detalhe do Aluno',
};

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'text-emerald-600 border-green-200 bg-green-50'
          : 'text-muted-foreground border-border'
      }
    >
      {label}
    </Badge>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    SCHEDULED: { label: 'Agendada', className: 'text-indigo-600 border-indigo-200 bg-indigo-50' },
    IN_PROGRESS: { label: 'Em andamento', className: 'text-amber-600 border-amber-200 bg-amber-50' },
    COMPLETED: { label: 'Concluída', className: 'text-emerald-600 border-green-200 bg-green-50' },
    CANCELLED: { label: 'Cancelada', className: 'text-red-600 border-red-200 bg-red-50' },
    NO_SHOW: { label: 'No-show', className: 'text-muted-foreground border-border' },
  };

  const config = map[status] ?? { label: status, className: 'text-muted-foreground border-border' };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof CreditCard;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminStudentDetailPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  const { data, error } = await getAdminStudentDetail(id);

  if (error || !data) {
    if (error?.includes('404') || error?.includes('não encontrado')) {
      notFound();
    }

    return (
      <PageWrapper className="max-w-4xl">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados do aluno: {error}</p>
        </div>
      </PageWrapper>
    );
  }

  const { user, stats, creditBatches, recentSessions, recentFeedbacks } = data;

  return (
    <PageWrapper className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ROUTES.ADMIN_STUDENTS} className="hover:text-foreground transition-colors">
          Alunos
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">{user.name}</span>
      </nav>

      {/* 1. Profile card */}
      <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge
              label={user.lastLoginAt ? 'Ativo' : 'Inativo'}
              active={!!user.lastLoginAt}
            />
            {user.deletionRequestedAt && (
              <Badge variant="destructive">Exclusão solicitada</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">País:</span>{' '}
            <span className="text-foreground">{user.country ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Fuso horário:</span>{' '}
            <span className="text-foreground">{user.timezone ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Idioma:</span>{' '}
            <span className="text-foreground">{user.preferredLanguage ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email confirmado:</span>{' '}
            <span className="text-foreground">{user.emailConfirmed ? 'Sim' : 'Não'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Cadastro:</span>{' '}
            <span className="text-foreground">{formatDatePtBR(user.createdAt)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Último login:</span>{' '}
            <span className="text-foreground">{formatDateTimePtBR(user.lastLoginAt)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Onboarding:</span>{' '}
            <span className="text-foreground">
              {user.onboardingCompletedAt ? formatDatePtBR(user.onboardingCompletedAt) : 'Pendente'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Marketing opt-in:</span>{' '}
            <span className="text-foreground">{user.marketingOptIn ? 'Sim' : 'Não'}</span>
          </div>
        </div>
      </section>

      {/* 2. Stats row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={CreditCard} label="Créditos" value={stats.creditBalance} color="var(--primary)" />
        <StatCard icon={Calendar} label="Total de sessões" value={stats.totalSessions} color="var(--primary)" />
        <StatCard icon={CheckCircle} label="Concluídas" value={stats.completedSessions} color="var(--success)" />
        <StatCard icon={XCircle} label="Canceladas" value={stats.cancelledSessions} color="var(--destructive)" />
      </section>

      {/* 3. Credit batches */}
      {creditBatches.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Lotes de Créditos</h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Tipo</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Total</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Usados</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Restantes</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Expira em</th>
                  </tr>
                </thead>
                <tbody>
                  {creditBatches.map((batch) => (
                    <tr key={batch.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm text-foreground capitalize">{batch.type}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{batch.total}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{batch.used}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{batch.remaining}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatDatePtBR(batch.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 4. Recent sessions */}
      {recentSessions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Sessões Recentes</h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Data</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Concluída em</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((session) => (
                    <tr key={session.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm text-foreground">{formatDateTimePtBR(session.startAt)}</td>
                      <td className="px-4 py-3">
                        <SessionStatusBadge status={session.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatDateTimePtBR(session.completedAt)}
                      </td>
                      <td className="px-4 py-3">
                        {session.hasFeedback ? (
                          <Link
                            href={ROUTES.ADMIN_FEEDBACK(session.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            Ver feedback
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 5. Recent feedbacks */}
      {recentFeedbacks.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Feedbacks Recentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentFeedbacks.map((fb) => (
              <div
                key={fb.id}
                className="bg-card border border-border rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-semibold text-foreground">
                      {fb.averageScore.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">/5</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      fb.reviewed
                        ? 'text-emerald-600 border-green-200 bg-green-50'
                        : 'text-amber-600 border-amber-200 bg-amber-50'
                    }
                  >
                    {fb.reviewed ? 'Revisado' : 'Pendente'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDatePtBR(fb.sessionDate)}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Enviado em {formatDatePtBR(fb.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageWrapper>
  );
}
