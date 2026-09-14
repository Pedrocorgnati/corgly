/**
 * Página de resumo da tentativa de exercicio.
 *
 * Exibe o resultado final apos encerrar a tentativa, com:
 * - Score derivado no servidor
 * - Lista revisavel de itens com gabarito
 * - CTA de retorno para lista de exercicios
 *
 * Dados carregados via GET /api/v1/exercises/attempts/[attemptId].
 */

import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { exerciseService } from '@/services/exercise.service';
import { ExerciseSummaryClient, type AttemptSummary } from '@/components/exercises/exercise-summary-client';
import { ROUTES } from '@/lib/constants/routes';
import { exerciseItemKindSchema } from '@/lib/exercises';

interface PageProps {
  params: Promise<{
    id: string;
    attemptId: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('exercises');

  return {
    title: t('summaryPageTitle', { id }),
  };
}

export default async function AttemptSummaryPage({ params }: PageProps) {
  // Verificar autenticacao no servidor
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    redirect(ROUTES.LOGIN);
  }

  let payload;
  try {
    payload = verifyJWT(token);
  } catch {
    redirect(ROUTES.LOGIN);
  }

  if (payload.role !== 'STUDENT') {
    redirect('/');
  }

  const { id: exerciseId, attemptId } = await params;

  let result;
  try {
    result = await exerciseService.getAttemptSummary(exerciseId, attemptId, payload.sub);
  } catch (err) {
    if (
      err instanceof AppError &&
      (err.code === 'ATTEMPT_001' || err.code === 'EXERCISE_001')
    ) {
      notFound();
    }
    throw err;
  }

  const summary: AttemptSummary = {
    attemptId: result.attempt.id,
    exerciseId: result.exercise.id,
    exerciseTitle: result.exercise.title,
    status: result.attempt.status,
    answeredCount: result.attempt.answeredCount,
    correctCount: result.attempt.correctCount,
    itemCount: result.attempt.itemCount,
    score: result.attempt.score,
    scorePercent: result.attempt.scorePercent,
    finishedAt: result.attempt.finishedAt?.toISOString() ?? null,
    items: result.items.map((item) => ({
      id: item.id,
      kind: exerciseItemKindSchema.parse(item.kind),
      position: item.position,
      payload: item.payload,
      answerKey: item.answerKey,
      userAnswer: item.answer,
      isCorrect: item.isCorrect,
    })),
  };

  return <ExerciseSummaryClient summary={summary} />;
}
