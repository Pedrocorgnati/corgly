import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, Calendar, User, CreditCard, MessageSquare } from 'lucide-react';
import { SESSION_STATUS_MAP } from '@/lib/constants/enums';
import { PageWrapper } from '@/components/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Detalhe da Sessão',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getSession(id: string) {
  const headersList = await headers();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/v1/admin/sessions/${id}`, {
    headers: {
      'x-user-id': headersList.get('x-user-id') ?? '',
      'x-user-role': headersList.get('x-user-role') ?? '',
      'x-token-version': headersList.get('x-token-version') ?? '0',
    },
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Erro ao carregar sessão');

  const json = await res.json();
  return json.data;
}

export default async function AdminSessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) notFound();

  const statusInfo = SESSION_STATUS_MAP[session.status as keyof typeof SESSION_STATUS_MAP];

  return (
    <PageWrapper className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={ROUTES.ADMIN_SESSIONS}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Voltar para lista de sessões"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground">Detalhe da Sessão</h1>
      </div>

      <div className="space-y-4">
        {/* Data e hora */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Data e Hora</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Início</p>
              <p className="text-foreground font-medium">
                {new Date(session.startAt).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Fim</p>
              <p className="text-foreground font-medium">
                {new Date(session.endAt).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo?.color ?? ''} ${statusInfo?.bg ?? ''}`}
              >
                {statusInfo?.label ?? session.status}
              </span>
            </div>
            {session.isRecurring && (
              <div>
                <p className="text-muted-foreground text-xs">Tipo</p>
                <p className="text-foreground text-xs">Recorrente</p>
              </div>
            )}
          </div>
        </div>

        {/* Aluno */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Aluno</h2>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-foreground font-medium">{session.student.name}</p>
            <p className="text-muted-foreground">{session.student.email}</p>
            <p className="text-muted-foreground text-xs">{session.student.timezone}</p>
          </div>
        </div>

        {/* Crédito */}
        {session.creditBatch && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Crédito Consumido</h2>
            </div>
            <div className="text-sm">
              <p className="text-foreground">{session.creditBatch.type}</p>
              <p className="text-muted-foreground text-xs">
                {session.creditBatch.totalCredits} créditos totais
              </p>
            </div>
          </div>
        )}

        {/* Feedback */}
        {session.feedback ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Feedback</h2>
              {session.feedback.reviewed && (
                <span className="ml-auto text-xs text-muted-foreground">Revisado</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <p className="text-xs text-muted-foreground">Clareza</p>
                <p className="font-medium">{session.feedback.clarityScore}/5</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Didática</p>
                <p className="font-medium">{session.feedback.didacticsScore}/5</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pontualidade</p>
                <p className="font-medium">{session.feedback.punctualityScore}/5</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Engajamento</p>
                <p className="font-medium">{session.feedback.engagementScore}/5</p>
              </div>
            </div>
            {session.feedback.comment && (
              <p className="text-sm text-muted-foreground italic">"{session.feedback.comment}"</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Feedback</h2>
            </div>
            <p className="text-sm text-muted-foreground">Nenhum feedback registrado.</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
