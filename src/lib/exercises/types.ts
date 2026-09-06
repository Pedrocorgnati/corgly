/**
 * Modelo de exercicio derivado das aulas do curso Corgly.
 *
 * Existem DOIS formatos, de proposito:
 *
 *  1. `LessonExerciseSource` — a copia fiel da aula, na ordem em que a fonte
 *     registra as alternativas. E dado de entrada, nao dado de tela.
 *  2. `Exercise` — o exercicio pronto para renderizar, ja com as letras a/b/c/d
 *     atribuidas e a alternativa correta distribuida (ver
 *     `answer-distribution.ts`).
 *
 * Manter os dois separados e o que permite copiar a aula sem mexer no gabarito
 * e, ao mesmo tempo, nao mostrar ao aluno oito questoes cuja resposta certa e
 * sempre a primeira alternativa.
 *
 * Contrato de forma da questao: corgly-classes/rules/09-secao6-multipla-escolha.md.
 */

/** Idiomas em que a fonte publica o conteudo da aula. Nao confundir com os 4 locales da interface. */
export type LessonContentLocale = 'pt' | 'en' | 'es';

/** Texto da aula nos tres idiomas publicados pela fonte. */
export type LessonText = Record<LessonContentLocale, string>;

/** Letras exibidas ao aluno, na ordem canonica da fonte. */
export const OPTION_LETTERS = ['a', 'b', 'c', 'd'] as const;

export type OptionLetter = (typeof OPTION_LETTERS)[number];

/** Numero de alternativas exigido por R-MC-01. */
export const OPTIONS_PER_QUESTION = OPTION_LETTERS.length;

/** Nota gramatical da aula (campo `verbo` da fonte). */
export interface GrammarPoint {
  /** `verbo.titulo` na fonte. */
  title: string;
  /** `verbo.estrutura` na fonte, nos tres idiomas publicados. */
  explanation: LessonText;
}

/** Uma questao de multipla escolha exatamente como a fonte a registra. */
export interface SourceQuestion {
  /** Identificador estavel, usado como `key` de render e no `name` do grupo de radio. */
  id: string;
  /** `multipla[].pergunta`, verbatim. */
  prompt: string;
  /** `multipla[].opcoes`, verbatim e na ordem da fonte. Exatamente 4 (R-MC-01). */
  options: readonly string[];
  /**
   * Indice da alternativa correta DENTRO de `options`.
   * Aulas legadas sem o campo `correta` usam 0 por convencao da fonte.
   */
  correctSourceIndex: number;
}

/** Uma aula copiada da fonte, antes de virar exercicio de tela. */
export interface LessonExerciseSource {
  /** Numero da aula no curso. */
  lessonNumber: number;
  /** Slug estavel da aula, usado para compor o id do exercicio. */
  slug: string;
  /** Titulo da aula, verbatim. */
  title: string;
  /** Nivel do curso (`nivel` na fonte). */
  level: number;
  /** Nome do arquivo de origem em corgly-classes/dados-aulas/, para rastreabilidade. */
  sourceFile: string;
  grammarPoint: GrammarPoint;
  questions: readonly SourceQuestion[];
}

/** Alternativa pronta para render, ja com a letra atribuida. */
export interface ExerciseOption {
  letter: OptionLetter;
  /** Texto da alternativa, verbatim da fonte. */
  text: string;
}

/** Questao pronta para render. */
export interface ExerciseQuestion {
  id: string;
  prompt: string;
  /** Sempre `OPTIONS_PER_QUESTION` alternativas, na ordem de exibicao. */
  options: readonly ExerciseOption[];
  /** Letra da alternativa correta apos a distribuicao. */
  correctLetter: OptionLetter;
}

/**
 * Tipo de exercicio. Hoje so existe multipla escolha (secao 6 da aula); as
 * discursivas e o vocabulario da fonte tem outras formas e entram como novos
 * membros desta uniao quando forem implementados.
 */
export type ExerciseKind = 'multiple-choice';

/** Exercicio pronto para render. */
export interface Exercise {
  /** Id estavel: `{slug da aula}-{kind}`. */
  id: string;
  kind: ExerciseKind;
  lessonNumber: number;
  lessonTitle: string;
  level: number;
  sourceFile: string;
  grammarPoint: GrammarPoint;
  questions: readonly ExerciseQuestion[];
}
