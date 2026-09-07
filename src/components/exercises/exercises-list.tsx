/**
 * Lista de exercicios do aluno.
 *
 * Server component de proposito: so o card de multipla escolha precisa de
 * estado, entao a lista fica fora do bundle do cliente. Cada exercicio vira um
 * item da lista, e o tipo do exercicio decide qual card renderizar — hoje so
 * existe `multiple-choice` (ver src/lib/exercises/types.ts).
 */

import { ExerciseMultipleChoice } from './exercise-multiple-choice';
import type { StaticExercise } from '@/lib/exercises';

interface ExercisesListProps {
  exercises: readonly StaticExercise[];
}

export function ExercisesList({ exercises }: ExercisesListProps) {
  return (
    <ul data-testid="exercises-list" className="space-y-6">
      {exercises.map((exercise) => (
        <li key={exercise.id}>
          <ExerciseMultipleChoice exercise={exercise} />
        </li>
      ))}
    </ul>
  );
}
