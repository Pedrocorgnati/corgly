import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FeedbackReviewButton } from '@/components/admin/FeedbackReviewButton';
import { getSessionFeedback } from '@/actions/admin-students';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Feedback da Sessão',
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function ReadOnlyStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= score
              ? 'text-warning fill-warning'
              : 'text-muted-foreground'
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-foreground font-medium">{score}/5</span>
    </div>
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  clarity: 'Claridade das explicações',
  didacticQuality: 'Qualidade didática',
  punctuality: 'Pontualidade',
  engagement: 'Engajamento',
};

export default async function AdminFeedbackPage({ params }: Props) {
  const { sessionId } = await params;

  if (!sessionId) notFound();

  const { data, error } = await getSessionFeedback(sessionId);

  if (error?.includes('404') || error?.includes('não encontrado')) {
    notFound();
  }

  if (error || !data) {
    return (
      <PageWrapper className="max-w-2xl">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
          <p className="text-sm text-destructive">Erro ao carregar feedback: {error}</p>
        </div>
      </PageWrapper>
    );
  }

  const dimensions: { key: string; score: number }[] = [
    { key: 'clarity', score: data.clarity },
    { key: 'didacticQuality', score: data.didacticQuality },
    { key: 'punctuality', score: data.punctuality },
    { key: 'engagement', score: data.engagement },
  ];

  return (
    <PageWrapper className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ROUTES.ADMIN_SESSIONS} className="hover:text-foreground transition-colors">
          Sessões
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">Feedback</span>
      </nav>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Feedback da Sessão</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aluno: {data.studentName} &middot; Sessão de {formatDate(data.sessionDate)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              data.reviewed
                ? 'text-success border-green-200 bg-green-50'
                : 'text-warning border-amber-200 bg-amber-50'
            }
          >
            {data.reviewed ? 'Revisado' : 'Pendente'}
          </Badge>
        </div>

        {/* Average score */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-muted/30 rounded-xl">
          <Star className="h-6 w-6 text-warning fill-warning" />
          <div>
            <p className="text-2xl font-bold text-foreground">{data.averageScore.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Média geral</p>
          </div>
        </div>

        {/* Dimension scores */}
        <div className="space-y-4">
          {dimensions.map(({ key, score }) => (
            <div
              key={key}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <p className="text-sm font-medium text-foreground">
                {DIMENSION_LABELS[key] ?? key}
              </p>
              <ReadOnlyStars score={score} />
            </div>
          ))}
        </div>

        {/* Comment */}
        <div className="mt-6 p-4 bg-muted/30 rounded-xl">
          <p className="text-xs font-medium text-muted-foreground mb-1">Comentário</p>
          {data.comment ? (
            <p className="text-sm text-foreground">{data.comment}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum comentário</p>
          )}
        </div>

        {/* Review action */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {data.reviewedAt && <span>Revisado em {formatDate(data.reviewedAt)}</span>}
          </div>
          <FeedbackReviewButton feedbackId={data.id} initialReviewed={data.reviewed} />
        </div>
      </div>
    </PageWrapper>
  );
}
