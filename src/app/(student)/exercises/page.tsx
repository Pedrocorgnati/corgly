/**
 * Aba de exercicios do aluno.
 *
 * Estados desta rota:
 *   loading -> loading.tsx (skeleton da lista de cards)
 *   error   -> error.tsx (erro de banco ou de sessao; boundary com retry)
 *   empty   -> catalogo sem liberacao para este aluno
 *   success -> lista de cards que navegam para /exercises/[id]
 *
 * A renderizacao ja e dinamica: o layout de (student) declara
 * `export const dynamic = 'force-dynamic'` porque depende da sessao.
 *
 * Ausencia de liberacoes usa o empty state canonico. A lista nunca injeta
 * exercicio estatico nem altera pertencimento conforme o idioma do leitor.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ExerciseCard } from '@/components/exercises';
import { EmptyState } from '@/components/ui/empty-state';
import { PageWrapper } from '@/components/shared';
import { ROUTES } from '@/lib/constants/routes';
import { getStudentExercises } from '@/lib/exercises/actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exercises');
  return {
    title: t('pageTitle'),
    robots: { index: false },
  };
}

export default async function ExercisesPage() {
  const t = await getTranslations('exercises');

  const exercises = await getStudentExercises();

  return (
    <PageWrapper data-testid="page-exercises">
      <nav aria-label={t('breadcrumbLabel')} className="mb-4 text-sm text-muted-foreground">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href={ROUTES.DASHBOARD} className="transition-colors hover:text-foreground">
              {t('breadcrumbDashboard')}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="inline h-3.5 w-3.5" />
          </li>
          <li className="font-medium text-foreground">{t('pageTitle')}</li>
        </ol>
      </nav>

      <div data-testid="exercises-header" className="mb-6 flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('pageDescription')}</p>
        </div>
      </div>

      {exercises.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          className="rounded-2xl border border-dashed border-border bg-card"
          data-testid="library-empty"
        />
      ) : (
        <ul
          data-testid="exercise-assignments-list"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {exercises.map((exercise) => (
            <li key={exercise.exerciseId} className="h-full">
              <ExerciseCard {...exercise} />
            </li>
          ))}
        </ul>
      )}
    </PageWrapper>
  );
}
