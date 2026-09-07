import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, ClipboardList, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getSessionFeedback, type SessionFeedbackDetail } from '@/actions/admin-students';
import { FeedbackReviewButton } from '@/components/admin/FeedbackReviewButton';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Feedback da Sessão',
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

/**
 * Contrato REAL de GET /api/v1/admin/sessions/[id]/feedback: a rota devolve o
 * `FeedbackItem` de src/services/feedback.service.ts (mapFeedback), serializado
 * por NextResponse.json — Date vira string ISO. O vocabulario das notas e
 * listening|speaking|writing|vocabulary (prisma/schema.prisma model Feedback).
 * Nao existe clarity/didacticQuality/punctuality/engagement, nem studentName,
 * nem `comment`: o texto livre se chama `overallFeedback`.
 *
 * Onde esse contrato e conferido: no fetcher. `getSessionFeedback`
 * (src/actions/admin-students.ts) passa `sessionFeedbackDetailOrNullSchema` para
 * o `apiFetch` de admin, que valida com Zod na fronteira de rede e devolve
 * `SessionFeedbackDetail | null` ou um erro com o motivo logado. Payload fora do
 * formato chega aqui como `error`, nao como objeto meio preenchido — por isso
 * esta tela consome o tipo em vez de revalidar (schema duplicado e schema que
 * sai de sincronia; foi exatamente esse o drift corrigido em 09-06).
 */
type DimensionKey = keyof SessionFeedbackDetail['scores'];
type DimensionNoteKey =
  | 'listeningFeedback'
  | 'speakingFeedback'
  | 'writingFeedback'
  | 'vocabularyFeedback';

const DIMENSIONS: Array<{ key: DimensionKey; label: string; noteKey: DimensionNoteKey }> = [
  { key: 'listening',  label: 'Escuta',      noteKey: 'listeningFeedback' },
  { key: 'speaking',   label: 'Fala',        noteKey: 'speakingFeedback' },
  { key: 'writing',    label: 'Escrita',     noteKey: 'writingFeedback' },
  { key: 'vocabulary', label: 'Vocabulário', noteKey: 'vocabularyFeedback' },
];

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Nota ausente ou nao-finita vira travessao — nunca `NaN`. */
function formatScore(value: unknown, digits = 1): string {
  return isScore(value) ? value.toFixed(digits) : '—';
}

function ReadOnlyStars({ score }: { score: number | null }) {
  const filled = isScore(score) ? Math.round(score) : 0;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= filled
              ? 'text-warning fill-warning'
              : 'text-muted-foreground'
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-foreground font-medium">
        {isScore(score) ? `${formatScore(score, 0)}/5` : 'Sem nota'}
      </span>
    </div>
  );
}

export default async function AdminFeedbackPage({ params }: Props) {
  const { sessionId } = await params;

  if (!sessionId) notFound();

  const { data: feedback, error } = await getSessionFeedback(sessionId);

  if (error?.includes('404') || error?.includes('não encontrado')) {
    notFound();
  }

  if (error) {
    return (
      <PageWrapper className="max-w-2xl" data-testid="page-admin-feedback-detail">
        <div data-testid="admin-feedback-detail-error" className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
          <p className="text-sm text-destructive">Erro ao carregar feedback: {error}</p>
        </div>
      </PageWrapper>
    );
  }

  // A rota responde 200 com `data: null` quando a sessao ainda nao tem
  // feedback. Isso e estado vazio legitimo, nao erro.
  if (!feedback) {
    return (
      <PageWrapper className="max-w-2xl" data-testid="page-admin-feedback-detail">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <EmptyState
            data-testid="admin-feedback-detail-empty"
            icon={ClipboardList}
            title="Sessão sem feedback"
            description="Esta sessão ainda não recebeu avaliação do aluno."
          />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="max-w-2xl space-y-6" data-testid="page-admin-feedback-detail">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ROUTES.ADMIN_SESSIONS} className="hover:text-foreground transition-colors">
          Sessões
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">Feedback</span>
      </nav>

      {/* Header */}
      <div data-testid="admin-feedback-detail-header" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Feedback da Sessão</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sessão de {formatDate(feedback.sessionDate)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              feedback.reviewed
                ? 'text-success border-green-200 bg-green-50'
                : 'text-warning border-amber-200 bg-amber-50'
            }
          >
            {feedback.reviewed ? 'Revisado' : 'Pendente'}
          </Badge>
        </div>

        {/* Average score */}
        <div data-testid="admin-feedback-detail-score" className="flex items-center gap-3 mb-6 p-4 bg-muted/30 rounded-xl">
          <Star className="h-6 w-6 text-warning fill-warning" />
          <div>
            <p className="text-2xl font-bold text-foreground">{formatScore(feedback.averageScore)}</p>
            <p className="text-xs text-muted-foreground">Média geral</p>
          </div>
        </div>

        {/* Dimension scores */}
        <div data-testid="admin-feedback-detail-dimensions" className="space-y-4">
          {DIMENSIONS.map(({ key, label, noteKey }) => {
            const note = feedback[noteKey];

            return (
              <div
                key={key}
                data-testid={`admin-feedback-detail-dimension-${key}`}
                className="py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <ReadOnlyStars score={feedback.scores[key]} />
                </div>
                {typeof note === 'string' && note.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">{note}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Comentario geral. A rota admin entrega `privateNote` neste campo
            quando existe (feedback.service.ts: getBySession com includePrivate). */}
        <div data-testid="admin-feedback-detail-comment" className="mt-6 p-4 bg-muted/30 rounded-xl">
          <p className="text-xs font-medium text-muted-foreground mb-1">Comentário</p>
          {feedback.overallFeedback ? (
            <p className="text-sm text-foreground">{feedback.overallFeedback}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum comentário</p>
          )}
        </div>

        {/* Review action */}
        <div data-testid="admin-feedback-detail-review-action" className="mt-6 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {feedback.reviewedAt && <span>Revisado em {formatDate(feedback.reviewedAt)}</span>}
          </div>
          <FeedbackReviewButton feedbackId={feedback.id} initialReviewed={feedback.reviewed} />
        </div>
      </div>
    </PageWrapper>
  );
}
