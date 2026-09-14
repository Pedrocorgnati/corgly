/**
 * Catalogo de exercicios do aluno.
 *
 * @deprecated Este modulo foi migrado para o banco de dados.
 * Use ExerciseService para listar exercicios do aluno.
 * Mantido somente como stub para imports historicos de testes. A fonte estatica
 * nao participa mais do caminho de leitura nem monta exercicios em runtime.
 */

import type { StaticExercise } from './types';

/** Lista vazia preservada apenas para compatibilidade com imports diretos antigos. */
export function getExercises(): readonly StaticExercise[] {
  return [];
}

/** O catalogo estatico foi desligado; nenhum id e resolvido por esta fonte. */
export function getExerciseById(_id: string): StaticExercise | undefined {
  return undefined;
}
