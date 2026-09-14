/**
 * Tentativa de um exercicio (tela cheia, um item por vez).
 *
 * Server Component que le o banco DIRETO via `exerciseService.getPlayableForStudent`
 * (opcao prevista na secao 6.1 do source): o envelope jogavel nao traz
 * `answerKey` — o gabarito so volta do POST de respostas, no cliente.
 *
 * Guarda de auth herdada do `(student)/layout.tsx` (`getAuthUser` + redirect
 * para login quando nao ha sessao de aluno); a pagina resolve o usuario de
 * novo no mesmo padrao do layout para ter o `user.id` da consulta.
 * `src/proxy.ts` nao precisa de edicao: o prefixo `/exercises` ja consta em
 * `PRIVATE_PATH_PREFIXES` (D-008-1).
 *
 * Estados desta rota:
 *   loading -> loading.tsx (skeleton das tres faixas do drill)
 *   error   -> error.tsx (qualquer erro nao tratado abaixo; retry via
 *              `unstable_retry`, contrato Next 16.2)
 *   404     -> EXERCISE_001 (inexistente ou nao publicado) via `notFound()`
 *   403     -> ATTEMPT_004 (nao liberado para ESTE aluno): tela de acesso
 *              negado generica, que nao confirma se o exercicio existe para
 *              outros alunos
 *   success -> DrillShell com o envelope jogavel
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LockKeyhole } from 'lucide-react';
import { DrillShell } from '@/components/exercises';
import type { DrillExercise } from '@/components/exercises/drill-shell';
import { ROUTES } from '@/lib/constants/routes';
import { getAuthUser } from '@/lib/data/auth';
import { AppError } from '@/lib/errors';
import type { ExerciseItemKind } from '@/lib/exercises/exercise-item.schema';
import { exerciseService } from '@/services/exercise.service';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exercises');
  return {
    title: t('pageTitle'),
    robots: { index: false },
  };
}

interface ExerciseAttemptPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExerciseAttemptPage({ params }: ExerciseAttemptPageProps) {
  const { id } = await params;
  const t = await getTranslations('exercises');

  const user = await getAuthUser();
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  let envelope;
  try {
    envelope = await exerciseService.getPlayableForStudent(id, user.id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'EXERCISE_001') {
      notFound();
    }
    if (err instanceof AppError && err.code === 'ATTEMPT_004') {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-8">
          <div
            data-testid="exercise-access-denied"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center"
          >
            <LockKeyhole className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">
              {t('accessDeniedTitle')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('accessDeniedDescription')}</p>
            <Link
              href={ROUTES.EXERCISES}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              {t('backToExercises')}
            </Link>
          </div>
        </div>
      );
    }
    throw err;
  }

  const exercise: DrillExercise = {
    id: envelope.id,
    title: envelope.title,
    items: envelope.items.map((item) => ({
      id: item.id,
      kind: item.kind as ExerciseItemKind,
      position: item.position,
      payload: item.payload,
    })),
  };

  return <DrillShell exercise={exercise} />;
}
