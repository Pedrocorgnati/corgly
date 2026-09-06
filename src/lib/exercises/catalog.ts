/**
 * Catalogo de exercicios do aluno.
 *
 * Entrada: as aulas copiadas de corgly-classes (dado estatico, versionado).
 * Saida: exercicios prontos para render, com as letras ja distribuidas.
 *
 * A validacao roda aqui, e nao no componente: as invariantes de forma da
 * questao sao contrato da fonte (corgly-classes/rules/09-secao6-multipla-escolha.md).
 * Dado que viola a regra falha alto — a rota cai no error boundary com a causa
 * escrita — em vez de renderizar uma questao com tres alternativas ou com duas
 * alternativas iguais.
 */

import { distributeQuestion } from './answer-distribution';
import { LESSON_1_PARROT } from './lesson-1-parrot';
import {
  OPTIONS_PER_QUESTION,
  type Exercise,
  type LessonExerciseSource,
  type SourceQuestion,
} from './types';

/** Minimo de perguntas por exercicio (R-MC-01). */
const MIN_QUESTIONS = 4;

/** Textos que a fonte trata como alternativa nao preenchida (R-MC-01). */
const PLACEHOLDER_OPTIONS = new Set(['', '-', '—']);

/** Aulas ja trazidas para dentro do app, na ordem em que aparecem na tela. */
const LESSON_SOURCES: readonly LessonExerciseSource[] = [LESSON_1_PARROT];

function assertValidQuestion(question: SourceQuestion, lessonSlug: string): void {
  const where = `${lessonSlug}/${question.id}`;

  if (question.prompt.trim() === '') {
    throw new Error(`Exercicio invalido em ${where}: enunciado vazio.`);
  }

  if (question.options.length !== OPTIONS_PER_QUESTION) {
    throw new Error(
      `Exercicio invalido em ${where}: R-MC-01 exige ${OPTIONS_PER_QUESTION} alternativas, veio ${question.options.length}.`
    );
  }

  const normalized = question.options.map((option) => option.trim());

  if (normalized.some((option) => PLACEHOLDER_OPTIONS.has(option))) {
    throw new Error(`Exercicio invalido em ${where}: R-MC-01 proibe alternativa vazia ou placeholder.`);
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Exercicio invalido em ${where}: R-MC-01 proibe alternativa duplicada.`);
  }

  if (
    !Number.isInteger(question.correctSourceIndex) ||
    question.correctSourceIndex < 0 ||
    question.correctSourceIndex >= question.options.length
  ) {
    throw new Error(
      `Exercicio invalido em ${where}: gabarito ${question.correctSourceIndex} fora da faixa de alternativas.`
    );
  }
}

function buildExercise(source: LessonExerciseSource): Exercise {
  if (source.questions.length < MIN_QUESTIONS) {
    throw new Error(
      `Exercicio invalido em ${source.slug}: R-MC-01 exige no minimo ${MIN_QUESTIONS} perguntas, veio ${source.questions.length}.`
    );
  }

  const ids = new Set(source.questions.map((question) => question.id));
  if (ids.size !== source.questions.length) {
    throw new Error(`Exercicio invalido em ${source.slug}: ha perguntas com o mesmo id.`);
  }

  source.questions.forEach((question) => assertValidQuestion(question, source.slug));

  return {
    id: `${source.slug}-multiple-choice`,
    kind: 'multiple-choice',
    lessonNumber: source.lessonNumber,
    lessonTitle: source.title,
    level: source.level,
    sourceFile: source.sourceFile,
    grammarPoint: source.grammarPoint,
    questions: source.questions.map(distributeQuestion),
  };
}

/**
 * Memoizacao simples: o dado e constante de modulo, entao validar e distribuir
 * uma vez por processo basta. Nao ha invalidacao porque nao ha origem viva.
 */
let cache: readonly Exercise[] | null = null;

/**
 * Exercicios disponiveis para o aluno.
 *
 * @throws {Error} quando a copia de uma aula viola o contrato de forma da fonte.
 */
export function getExercises(): readonly Exercise[] {
  if (cache === null) {
    cache = LESSON_SOURCES.map(buildExercise);
  }
  return cache;
}

/** Um exercicio pelo id, ou `undefined` quando o id nao existe no catalogo. */
export function getExerciseById(id: string): Exercise | undefined {
  return getExercises().find((exercise) => exercise.id === id);
}
