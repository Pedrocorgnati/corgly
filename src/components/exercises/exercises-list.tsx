/**
 * Lista de exercicios do aluno.
 *
 * Server component de proposito: so o card de multipla escolha precisa de
 * estado, entao a lista fica fora do bundle do cliente.
 *
 * NOTA: O drill inline foi removido no item 011. Os cards agora navegam
 * para a rota de tentativa `/exercises/[id]`. Este componente permanece
 * como container generico para reuso futuro.
 */

import type { ReactNode } from 'react';

interface ExercisesListProps {
  children: ReactNode;
}

export function ExercisesList({ children }: ExercisesListProps) {
  return (
    <ul data-testid="exercises-list" className="space-y-6">
      {children}
    </ul>
  );
}