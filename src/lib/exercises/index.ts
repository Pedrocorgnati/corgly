/** Barrel do modulo de exercicios do aluno. */

export { getExercises, getExerciseById } from './catalog';
export { contentLocaleFor, resolveLessonText } from './lesson-text';
export { distributeQuestion, moveItem, targetCorrectPosition } from './answer-distribution';
export { LESSON_1_PARROT } from './lesson-1-parrot';
export {
  OPTION_LETTERS,
  OPTIONS_PER_QUESTION,
  type Exercise,
  type ExerciseKind,
  type ExerciseOption,
  type ExerciseQuestion,
  type GrammarPoint,
  type LessonContentLocale,
  type LessonExerciseSource,
  type LessonText,
  type OptionLetter,
  type SourceQuestion,
} from './types';
