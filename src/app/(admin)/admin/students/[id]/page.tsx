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
  StickyNote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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
      <PageWrapper className="max-w-4xl" data-testid="page-admin-student-detail">
        <div data-testid="admin-student-detail-error" className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados do aluno: {error}</p>
        </div>
      </PageWrapper>
    );
  }

  const { user, stats, creditBatches, recentSessions, recentFeedbacks } = data;

  return (
    <PageWrapper className="max-w-4xl space-y-6" data-testid="page-admin-student-detail">
      {/* Breadcrumb */}
      <nav data-testid="admin-student-detail-breadcrumb" aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ROUTES.ADMIN_STUDENTS} className="hover:text-foreground transition-colors">
          Alunos
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">{user.name}</span>
      </nav>

      {/* 1. Profile card */}
      <section data-testid="admin-student-detail-profile" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex gap-2">
              <StatusBadge
                label={user.lastLoginAt ? 'Ativo' : 'Inativo'}
                active={!!user.lastLoginAt}
              />
              {user.deletionRequestedAt && (
                <Badge variant="destructive">Exclusão solicitada</Badge>
              )}
            </div>
            <Link
              href={ROUTES.ADMIN_STUDENT_NOTES(id)}
              data-testid="admin-student-detail-notes-link"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              Notas internas
            </Link>
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
      <section data-testid="admin-student-detail-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={CreditCard} label="Créditos" value={stats.creditBalance} color="var(--primary)" />
        <StatCard icon={Calendar} label="Total de sessões" value={stats.totalSessions} color="var(--primary)" />
        <StatCard icon={CheckCircle} label="Concluídas" value={stats.completedSessions} color="var(--success)" />
        <StatCard icon={XCircle} label="Canceladas" value={stats.cancelledSessions} color="var(--destructive)" />
      </section>

      {/* 3. Credit batches — lista PAGINADA (últimos lotes). O saldo total do
          aluno é stats.creditBalance, agregado no banco sobre todos os lotes
          válidos: a soma da coluna "Restantes" desta tabela pode ser menor. */}
      <section data-testid="admin-student-detail-credit-batches">
        <h2 className="text-base font-semibold text-foreground mb-1">Lotes de Créditos</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Últimos lotes do aluno. Saldo válido total: {stats.creditBalance} crédito(s).
        </p>
        {creditBatches.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <EmptyState
              data-testid="admin-student-detail-credit-batches-empty"
              icon={CreditCard}
              title="Nenhum lote de créditos"
              description="Este aluno ainda não comprou créditos. Os lotes aparecerão aqui após a primeira compra."
            />
          </div>
        ) : (
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
                    <tr key={batch.id} data-testid={`admin-student-detail-credit-batch-row-${batch.id}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm text-foreground capitalize">{batch.type}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{batch.total}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{batch.used}</td>
                      <td
                        className={`px-4 py-3 text-sm font-medium ${
                          batch.expired ? 'text-muted-foreground line-through' : 'text-foreground'
                        }`}
                        title={batch.expired ? 'Lote expirado — não soma no saldo válido' : undefined}
                      >
                        {batch.remaining}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        <span className="inline-flex items-center gap-2">
                          {batch.expiresAt ? formatDatePtBR(batch.expiresAt) : 'Sem validade'}
                          {batch.expired && (
                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                              Expirado
                            </Badge>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 4. Recent sessions */}
      <section data-testid="admin-student-detail-sessions">
        <h2 className="text-base font-semibold text-foreground mb-3">Sessões Recentes</h2>
        {recentSessions.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <EmptyState
              data-testid="admin-student-detail-sessions-empty"
              icon={Calendar}
              title="Nenhuma sessão registrada"
              description="As aulas agendadas por este aluno aparecerão aqui."
            />
          </div>
        ) : (
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
                    <tr key={session.id} data-testid={`admin-student-detail-session-row-${session.id}`} className="border-b border-border last:border-0">
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
        )}
      </section>

      {/* 5. Recent feedbacks */}
      <section data-testid="admin-student-detail-feedbacks">
        <h2 className="text-base font-semibold text-foreground mb-3">Feedbacks Recentes</h2>
        {recentFeedbacks.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <EmptyState
              data-testid="admin-student-detail-feedbacks-empty"
              icon={MessageSquare}
              title="Nenhum feedback registrado"
              description="Os feedbacks enviados após as aulas concluídas aparecerão aqui."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentFeedbacks.map((fb) => (
              <div
                key={fb.id}
                data-testid={`admin-student-detail-feedback-card-${fb.id}`}
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
        )}
      </section>
    </PageWrapper>
  );
}
