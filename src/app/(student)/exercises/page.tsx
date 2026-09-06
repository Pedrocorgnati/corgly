/**
 * Aba de exercicios do aluno.
 *
 * Os exercicios nascem das aulas do curso (corgly-classes), copiadas para
 * `src/lib/exercises/` como dado tipado. Hoje ha um exercicio: a multipla
 * escolha da aula 1, "O aluno que conversou com o papagaio".
 *
 * Estados desta rota:
 *   loading -> loading.tsx (skeleton do segmento)
 *   error   -> error.tsx (getExercises lanca quando o dado copiado viola o
 *              contrato de forma da fonte; o boundary mostra o retry)
 *   empty   -> catalogo sem exercicio publicado
 *   success -> lista com o card interativo
 *
 * A renderizacao ja e dinamica: o layout de (student) declara
 * `export const dynamic = 'force-dynamic'` porque depende da sessao.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ExercisesList } from '@/components/exercises';
import { PageWrapper } from '@/components/shared';
import { ROUTES } from '@/lib/constants/routes';
import { getExercises } from '@/lib/exercises';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exercises');
  return {
    title: t('pageTitle'),
    robots: { index: false },
  };
}

export default async function ExercisesPage() {
  const t = await getTranslations('exercises');
  // Dado estatico e validado: erro de contrato sobe para o error boundary da
  // rota em vez de virar card quebrado na tela.
  const exercises = getExercises();

  return (
    <PageWrapper data-testid="page-exercises" className="max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
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
        <div
          data-testid="exercises-empty"
          className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"
        >
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('emptyDescription')}</p>
        </div>
      ) : (
        <ExercisesList exercises={exercises} />
      )}
    </PageWrapper>
  );
}
