'use server';

import { getAuthUser } from '@/lib/data/auth';
import type { SupportedLanguage } from '@/lib/constants/enums';
import type { ExerciseItemKind } from '@/lib/exercises';
import { ExerciseService, type StudentExerciseListRow } from '@/services/exercise.service';

const exerciseService = new ExerciseService();

export interface StudentExerciseCard {
  /** Exercise.id, usado como identidade publica do card. */
  id: string;
  /** Exercise.id para o link da rota jogavel. */
  exerciseId: string;
  /** Titulo no idioma do aluno */
  title: string;
  /** Idioma de apoio do exercicio */
  supportLanguage: SupportedLanguage;
  /** Nivel do curso */
  level: number;
  /** Materia (opcional) */
  subject: string | null;
  /** Total de itens do exercicio */
  itemCount: number;
  /** Tipo mais frequente, resolvido pelo helper compartilhado do dominio. */
  predominantKind: ExerciseItemKind | null;
  /** true se o aluno nunca abriu o card */
  isNew: boolean;
  /** Estado da tentativa mais recente */
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  /** Snapshot de progresso da tentativa mais recente, em andamento ou concluida. */
  progress: { answeredCount: number; correctCount: number; itemCount: number } | null;
}

/**
 * Lista exercicios atribuidos ao aluno logado.
 *
 * Consulta `ExerciseAssignment` ativo, resolve o titulo pelo idioma preferido
 * do aluno, e deriva o estado (novo, em andamento, concluido) a partir do
 * `ExerciseAttempt` mais recente.
 *
 * Retorna apenas metadados para renderizar cards. O conteudo jogavel e
 * carregado sob demanda em `/exercises/[id]`.
 */
export async function getStudentExercises(
  query: { q?: string; level?: number; subject?: string } = {},
): Promise<StudentExerciseCard[]> {
  const user = await getAuthUser();
  if (!user) {
    return [];
  }

  const { items } = await exerciseService.listForStudent(user.id, {
    ...query,
    page: 1,
    limit: 100,
  });

  return items.map((row: StudentExerciseListRow) => ({
    id: row.id,
    exerciseId: row.id,
    title: row.title,
    supportLanguage: row.supportLanguage,
    level: row.level,
    subject: row.subject,
    itemCount: row.itemCount,
    predominantKind: row.predominantKind,
    isNew: row.firstSeenAt === null,
    status: row.latestAttempt?.status ?? 'NOT_STARTED',
    progress: row.latestAttempt
      ? {
          answeredCount: row.latestAttempt.answeredCount,
          correctCount: row.latestAttempt.correctCount,
          itemCount: row.latestAttempt.itemCount,
        }
      : null,
  }));
}
