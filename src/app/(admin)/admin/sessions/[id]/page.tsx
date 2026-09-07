import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { internalApiOrigin } from '@/lib/internal-api';
import { ArrowLeft, Calendar, User, CreditCard, MessageSquare } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SessionStatus, SESSION_STATUS_MAP, SESSION_STATUS_LABEL_KEY } from '@/lib/constants/enums';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Detalhe da Sessão',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Contrato REAL de GET /api/v1/admin/sessions/[id]: a rota devolve a Session do
 * Prisma com `student`, `creditBatch` e `feedback` incluidos, serializada por
 * NextResponse.json — Date vira string ISO.
 *
 * As dimensoes canonicas do model Feedback sao listening/speaking/writing/
 * vocabulary (prisma/schema.prisma). Nao existe clarityScore, didacticsScore,
 * punctualityScore, engagementScore nem `comment`: o texto publico e
 * `overallFeedback`. Validar aqui e o que impede o payload de voltar a ser
 * `any` — sem isso, renomear campo no backend volta a pintar a tela de vazio
 * em silencio.
 */
const sessionDetailSchema = z.object({
  id: z.string(),
  status: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  isRecurring: z.boolean().default(false),
  student: z.object({
    name: z.string(),
    email: z.string(),
    timezone: z.string().nullable().default(null),
  }),
  creditBatch: z
    .object({
      id: z.string(),
      type: z.string(),
      totalCredits: z.number(),
    })
    .nullable()
    .default(null),
  feedback: z
    .object({
      id: z.string(),
      listeningScore: z.number(),
      speakingScore: z.number(),
      writingScore: z.number(),
      vocabularyScore: z.number(),
      overallFeedback: z.string().nullable().default(null),
      reviewed: z.boolean(),
      reviewedAt: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
});

type SessionDetail = z.infer<typeof sessionDetailSchema>;
type FeedbackDetail = NonNullable<SessionDetail['feedback']>;

const FEEDBACK_DIMENSIONS: Array<{
  key: 'listeningScore' | 'speakingScore' | 'writingScore' | 'vocabularyScore';
  label: string;
}> = [
  { key: 'listeningScore',  label: 'Escuta' },
  { key: 'speakingScore',   label: 'Fala' },
  { key: 'writingScore',    label: 'Escrita' },
  { key: 'vocabularyScore', label: 'Vocabulário' },
];

type FetchResult =
  | { kind: 'ok'; session: SessionDetail }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

/**
 * Encaminha o cookie de sessao para a propria API interna.
 *
 * Os headers de confianca (`x-user-id`, `x-user-role`, `x-token-version`) NAO
 * servem aqui: `src/proxy.ts` remove esses headers de toda requisicao que entra
 * (stripInternalHeaders) e so os injeta no ramo `/api/v1`, depois de validar o
 * token. Uma pagina do App Router nunca os recebe, entao le-los de `headers()`
 * produzia strings vazias e a rota respondia 401. O cookie e o unico portador
 * de identidade que sobrevive ate aqui — mesmo padrao de
 * `src/actions/admin-students.ts`.
 */
async function getSession(id: string): Promise<FetchResult> {
  const cookieStore = await cookies();
  const baseUrl = await internalApiOrigin();

  const res = await fetch(`${baseUrl}/api/v1/admin/sessions/${id}`, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (res.status === 404) return { kind: 'not-found' };
  if (res.status === 401 || res.status === 403) {
    return {
      kind: 'error',
      message: 'Sessão de administrador expirada ou sem permissão. Entre novamente.',
    };
  }
  if (!res.ok) return { kind: 'error', message: `Falha ao carregar sessão (HTTP ${res.status}).` };

  const json = await res.json();
  const parsed = sessionDetailSchema.safeParse(json?.data);

  if (!parsed.success) {
    console.error('[admin/sessions] contrato de dados quebrado', {
      sessionId: id,
      issues: parsed.error.issues,
    });
    return { kind: 'error', message: 'Resposta do servidor fora do formato esperado.' };
  }

  return { kind: 'ok', session: parsed.data };
}

function scoreLabel(value: number): string {
  return Number.isFinite(value) ? `${value}/5` : '—';
}

export default async function AdminSessionDetailPage({ params }: PageProps) {
  const tStatus = await getTranslations('sessionStatus');
  const { id } = await params;
  const result = await getSession(id);

  if (result.kind === 'not-found') notFound();

  if (result.kind === 'error') {
    return (
      <PageWrapper data-testid="page-admin-session-detail" className="max-w-3xl">
        <div
          data-testid="admin-session-detail-error"
          className="rounded-xl border border-border bg-card p-6 text-center"
        >
          <p className="text-sm text-destructive">Erro ao carregar sessão: {result.message}</p>
        </div>
      </PageWrapper>
    );
  }

  const session = result.session;
  const feedback: FeedbackDetail | null = session.feedback;
  const statusInfo = SESSION_STATUS_MAP[session.status as SessionStatus];

  return (
    <PageWrapper data-testid="page-admin-session-detail" className="max-w-3xl">
      <div data-testid="admin-session-detail-header" className="mb-6 flex items-center gap-3">
        <Link
          href={ROUTES.ADMIN_SESSIONS}
          data-testid="admin-session-detail-back-link"
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
        <div data-testid="admin-session-detail-datetime" className="rounded-xl border border-border bg-card p-5">
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
                {SESSION_STATUS_LABEL_KEY[session.status as SessionStatus]
                  ? tStatus(SESSION_STATUS_LABEL_KEY[session.status as SessionStatus])
                  : session.status}
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
        <div data-testid="admin-session-detail-student" className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Aluno</h2>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-foreground font-medium">{session.student.name}</p>
            <p className="text-muted-foreground">{session.student.email}</p>
            <p className="text-muted-foreground text-xs">{session.student.timezone ?? '—'}</p>
          </div>
        </div>

        {/* Crédito */}
        {session.creditBatch && (
          <div data-testid="admin-session-detail-credit" className="rounded-xl border border-border bg-card p-5">
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

        {/* Feedback — dimensões canônicas do model Feedback */}
        {feedback ? (
          <div data-testid="admin-session-detail-feedback" className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Feedback</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {feedback.reviewed ? 'Revisado' : 'Pendente de revisão'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              {FEEDBACK_DIMENSIONS.map(({ key, label }) => (
                <div key={key} data-testid={`admin-session-detail-feedback-${key}`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{scoreLabel(feedback[key])}</p>
                </div>
              ))}
            </div>
            {feedback.overallFeedback ? (
              <p className="text-sm text-muted-foreground italic">
                &ldquo;{feedback.overallFeedback}&rdquo;
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem comentário geral.</p>
            )}
          </div>
        ) : (
          <div data-testid="admin-session-detail-feedback" className="rounded-xl border border-border bg-card p-5">
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
