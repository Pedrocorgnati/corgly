import { z } from 'zod';

import { OPTIONS_PER_QUESTION, PLACEHOLDER_OPTIONS } from './types';

/**
 * Contrato de forma dos itens de exercicio (`ExerciseItem.payload` e
 * `ExerciseItem.answerKey`).
 *
 * As duas colunas sao `Json` no banco, entao Zod e o unico contrato que as
 * protege: nao ha tipo de coluna para violar. Este arquivo fecha os schemas dos
 * quatro tipos da Fase 1 ANTES de o model e a migration subirem, na ordem de
 * build do plano.
 *
 * Duas regras estruturam tudo o que esta aqui:
 *
 *  - **`payload` nunca carrega o gabarito.** `payload` e o que vai para o
 *    cliente; `answerKey` fica no servidor. E por isso que `MATCH_CLICK` guarda
 *    duas colunas independentes no payload e o pareamento no answerKey, e que
 *    `MULTIPLE_CHOICE` e `TEXT_CHOICE` guardam as alternativas no payload e o
 *    indice correto no answerKey.
 *  - **O discriminador e `kind`, e a uniao e sobre `{ kind, payload, answerKey }`.**
 *    Regra cruzada (indice dentro da faixa, id de par existente) so e
 *    verificavel com as duas colunas juntas, nunca sobre `payload` isolado.
 *
 * O eixo linguistico nao mora aqui. Qual e o idioma de apoio de um item e
 * `Exercise.supportLanguage`; um terceiro eixo por item seria coluna nova e
 * precisa ser declarado como tal, nao virar campo silencioso no `payload`.
 *
 * Padrao do arquivo: tupla `as const` -> `z.enum` -> schemas -> tipos derivados
 * por `z.infer`, espelhando `src/lib/assets/asset.schema.ts`. Nenhum tipo deste
 * modulo e escrito a mao.
 */

/**
 * Motor visual de um item de exercicio.
 *
 * **A ordem desta tupla e a ordem de armazenamento do `ENUM(...)` nativo do
 * MySQL.** Acrescentar sempre no fim; nunca remover nem reordenar um valor que
 * ja foi para producao, sob pena de reinterpretar as linhas existentes. O teste
 * de ontologia trava esta ordem antes de a migration ser escrita.
 *
 * O tipo `ExerciseItemKind` nasce desta tupla, e nao do `@prisma/client`: o
 * enum nativo e derivado dela, nunca o contrario.
 */
export const EXERCISE_ITEM_KINDS = [
  'MULTIPLE_CHOICE',
  'MATCH_CLICK',
  'AUDIO_WORD',
  'AUDIO_CLOZE',
  'AUDIO_SENTENCE',
  'AUDIO_CHOICE',
  'AUDIO_ORDER',
  'TEXT_CHOICE',
  'VERB_CLOZE',
  'IMAGE_WORD',
  'IMAGE_CHOICE',
  'IMAGE_SPEAK',
  'AUDIO_SHADOW',
  'L1_SPEAK_PT',
] as const;

/**
 * Subconjunto implementado na Fase 1, na mesma ordem da tupla completa.
 *
 * Os outros dez valores existem no enum e sao rejeitados pela uniao ate ganharem
 * branch proprio. Rejeitar um kind valido porem nao implementado e o
 * comportamento correto, nao um defeito.
 */
export const PHASE_1_EXERCISE_ITEM_KINDS = [
  'MULTIPLE_CHOICE',
  'MATCH_CLICK',
  'TEXT_CHOICE',
  'VERB_CLOZE',
] as const;

export const exerciseItemKindSchema = z.enum(EXERCISE_ITEM_KINDS);

/**
 * Tempos verbais oferecidos pelo select de `VERB_CLOZE`.
 *
 * Dado de conteudo, nao de dominio: muda com decisao pedagogica e por isso nao
 * vira enum de Prisma, fica no `payload` validado por Zod.
 *
 * PENDENCIA DE OPERADOR (DA-1): a lista fechada nao existe no repositorio nem e
 * enumerada pelo plano. A semente abaixo tem o unico tempo com evidencia em
 * disco (`grammarPoint.title` e `grammarPoint.explanation.pt` da aula 1, em
 * `lesson-1-parrot.ts`). Crescer a lista e uma linha; o teste de rejeicao ja
 * guarda a fronteira. Nao inventar taxonomia pedagogica para preenche-la.
 */
export const VERB_TENSES = ['PRESENTE_INDICATIVO'] as const;

/**
 * Pessoas cobertas pelas terminacoes `-o`, `-a`, `-amos` e `-am` que a aula 1
 * ensina para os regulares em `-AR`.
 */
export const VERB_PERSONS = ['EU', 'VOCE_ELE_ELA', 'NOS', 'VOCES_ELES_ELAS'] as const;

export const verbTenseSchema = z.enum(VERB_TENSES);
export const verbPersonSchema = z.enum(VERB_PERSONS);

/** Marcador da lacuna na frase de `VERB_CLOZE`. Exatamente uma ocorrencia por frase. */
export const VERB_CLOZE_MARKER = '{{verbo}}';

/** Cardinalidade de alternativas dos tipos que aceitam de 2 a 5 (nao `MULTIPLE_CHOICE`). */
export const MIN_FLEXIBLE_OPTIONS = 2;
export const MAX_FLEXIBLE_OPTIONS = 5;

/** Cardinalidade de pares de `MATCH_CLICK`: padrao 5, minimo 3, maximo 8. */
export const MIN_MATCH_PAIRS = 3;
export const MAX_MATCH_PAIRS = 8;

// ---------------------------------------------------------------------------
// Primitivas compartilhadas pelos quatro tipos
// ---------------------------------------------------------------------------

/** Enunciado da pergunta, verbatim do admin. */
export const exercisePromptSchema = z
  .string()
  .trim()
  .min(1, 'Enunciado obrigatorio')
  .max(500, 'Enunciado excede 500 caracteres');

/** Texto de uma alternativa. */
export const exerciseOptionTextSchema = z
  .string()
  .trim()
  .min(1, 'Alternativa obrigatoria')
  .max(300, 'Alternativa excede 300 caracteres');

/** Texto de um lado de par de `MATCH_CLICK`. */
export const matchEntryTextSchema = z
  .string()
  .trim()
  .min(1, 'Texto do par obrigatorio')
  .max(200, 'Texto do par excede 200 caracteres');

/** Id estavel de uma entrada de coluna, usado como `key` de render e no gabarito. */
export const exerciseEntryIdSchema = z
  .string()
  .trim()
  .min(1, 'Id obrigatorio')
  .max(64, 'Id excede 64 caracteres')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Id deve usar letras, numeros, ponto, dois-pontos, hifen ou underscore');

/**
 * Helper de unicidade usado pelos `superRefine`.
 *
 * Recebe valores ja normalizados pelo `.trim()` das primitivas, entao nao
 * re-normaliza: a comparacao e sobre o valor que sai do parse, que e o mesmo que
 * o banco vai guardar.
 */
function addIssueOnDuplicate(
  values: readonly string[],
  ctx: z.RefinementCtx,
  basePath: readonly (string | number)[],
  message: string
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, index],
        message,
      });
      return;
    }
    seen.add(value);
  });
}

/**
 * Resto de R-MC-01 que nao cabe na cardinalidade: nenhum placeholder, nenhuma
 * duplicata. A alternativa vazia ja e barrada por `exerciseOptionTextSchema`.
 */
function addIssuesOnInvalidOptionSet(
  options: readonly string[],
  ctx: z.RefinementCtx,
  basePath: readonly (string | number)[] = ['options']
): void {
  options.forEach((option, index) => {
    if (PLACEHOLDER_OPTIONS.has(option)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, index],
        message: 'R-MC-01 proibe alternativa vazia ou placeholder',
      });
    }
  });

  addIssueOnDuplicate(options, ctx, basePath, 'R-MC-01 proibe alternativa duplicada');
}

// ---------------------------------------------------------------------------
// MULTIPLE_CHOICE
// ---------------------------------------------------------------------------

/**
 * Cardinalidade fixa em `OPTIONS_PER_QUESTION` (R-MC-01), importada de
 * `./types` para que o schema e o catalogo estatico nao mantenham dois numeros.
 */
export const multipleChoicePayloadSchema = z
  .object({
    prompt: exercisePromptSchema,
    options: z
      .array(exerciseOptionTextSchema)
      .length(OPTIONS_PER_QUESTION, `R-MC-01 exige exatamente ${OPTIONS_PER_QUESTION} alternativas`),
  })
  .superRefine((data, ctx) => {
    addIssuesOnInvalidOptionSet(data.options, ctx);
  });

/** A faixa superior de `correctIndex` e regra cruzada e vive na uniao. */
export const multipleChoiceAnswerKeySchema = z.object({
  correctIndex: z.number().int('correctIndex deve ser inteiro').min(0, 'correctIndex deve ser >= 0'),
});

// ---------------------------------------------------------------------------
// TEXT_CHOICE
// ---------------------------------------------------------------------------

export const textChoicePayloadSchema = z
  .object({
    /**
     * Bloco de leitura em TEXTO PURO.
     *
     * Renderizado com `whitespace-pre-wrap` num elemento sem HTML, e NUNCA com
     * `dangerouslySetInnerHTML`. Nao existe renderizador de markdown nem
     * sanitizador no projeto; o unico precedente de texto rico e o corpo do CMS
     * renderizado sem sanitizacao, e copia-lo para um campo alimentado pelo
     * formulario do admin abriria superficie de XSS nova. Decisao de seguranca,
     * nao de escopo.
     */
    readingText: z
      .string()
      .trim()
      .min(1, 'Bloco de leitura obrigatorio')
      .max(4000, 'Bloco de leitura excede 4000 caracteres'),
    prompt: exercisePromptSchema,
    options: z
      .array(exerciseOptionTextSchema)
      .min(MIN_FLEXIBLE_OPTIONS, `TEXT_CHOICE exige no minimo ${MIN_FLEXIBLE_OPTIONS} alternativas`)
      .max(MAX_FLEXIBLE_OPTIONS, `TEXT_CHOICE aceita no maximo ${MAX_FLEXIBLE_OPTIONS} alternativas`),
  })
  .superRefine((data, ctx) => {
    addIssuesOnInvalidOptionSet(data.options, ctx);
  });

export const textChoiceAnswerKeySchema = z.object({
  correctIndex: z.number().int('correctIndex deve ser inteiro').min(0, 'correctIndex deve ser >= 0'),
});

// ---------------------------------------------------------------------------
// VERB_CLOZE
// ---------------------------------------------------------------------------

export const verbClozePayloadSchema = z
  .object({
    infinitive: z.string().trim().min(1, 'Infinitivo obrigatorio').max(80, 'Infinitivo excede 80 caracteres'),
    tense: verbTenseSchema,
    person: verbPersonSchema,
    sentence: z
      .string()
      .trim()
      .min(1, 'Frase obrigatoria')
      .max(500, 'Frase excede 500 caracteres'),
  })
  .superRefine((data, ctx) => {
    const markerCount = data.sentence.split(VERB_CLOZE_MARKER).length - 1;

    if (markerCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sentence'],
        message: `Frase precisa conter o marcador ${VERB_CLOZE_MARKER}`,
      });
      return;
    }

    if (markerCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sentence'],
        message: `Frase tem ${markerCount} marcadores ${VERB_CLOZE_MARKER}; a lacuna e uma so`,
      });
    }
  });

/**
 * `accepted` declara APENAS o formato das variantes aceitas. A comparacao
 * normalizada da resposta do aluno (trim, minusculas, pontuacao, acento) e da
 * correcao, nao deste contrato de dado.
 */
export const verbClozeAnswerKeySchema = z
  .object({
    canonical: z
      .string()
      .trim()
      .min(1, 'Forma canonica obrigatoria')
      .max(120, 'Forma canonica excede 120 caracteres'),
    accepted: z
      .array(z.string().trim().min(1, 'Variante vazia').max(120, 'Variante excede 120 caracteres'))
      .max(20, 'accepted aceita no maximo 20 variantes')
      .default([]),
  })
  .superRefine((data, ctx) => {
    addIssueOnDuplicate(data.accepted, ctx, ['accepted'], 'Variante duplicada em accepted');

    data.accepted.forEach((variant, index) => {
      if (variant === data.canonical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accepted', index],
          message: 'Variante repete a forma canonica',
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// MATCH_CLICK
// ---------------------------------------------------------------------------

export const matchEntrySchema = z.object({
  id: exerciseEntryIdSchema,
  text: matchEntryTextSchema,
});

const matchColumnSchema = z
  .array(matchEntrySchema)
  .min(MIN_MATCH_PAIRS, `MATCH_CLICK exige no minimo ${MIN_MATCH_PAIRS} pares`)
  .max(MAX_MATCH_PAIRS, `MATCH_CLICK aceita no maximo ${MAX_MATCH_PAIRS} pares`);

function addIssuesOnInvalidMatchColumn(
  column: readonly z.infer<typeof matchEntrySchema>[],
  ctx: z.RefinementCtx,
  columnName: 'left' | 'right'
): void {
  addIssueOnDuplicate(
    column.map((entry) => entry.id),
    ctx,
    [columnName],
    'Id duplicado na coluna'
  );
  addIssueOnDuplicate(
    column.map((entry) => entry.text),
    ctx,
    [columnName],
    'Texto duplicado na coluna'
  );
}

/**
 * Duas colunas independentes: o pareamento e gabarito e nao pode viajar para o
 * cliente dentro do `payload`.
 *
 * A coluna A e o idioma de apoio e a coluna B e PT; qual e o idioma de apoio
 * esta em `Exercise.supportLanguage`, nao aqui.
 */
export const matchClickPayloadSchema = z
  .object({
    left: matchColumnSchema,
    right: matchColumnSchema,
  })
  .superRefine((data, ctx) => {
    addIssuesOnInvalidMatchColumn(data.left, ctx, 'left');
    addIssuesOnInvalidMatchColumn(data.right, ctx, 'right');

    if (data.left.length !== data.right.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['right'],
        message: `Equivalencia 1:1 exige colunas do mesmo tamanho; left tem ${data.left.length} e right tem ${data.right.length}`,
      });
    }
  });

export const matchClickAnswerKeySchema = z
  .object({
    pairs: z
      .array(
        z.object({
          leftId: exerciseEntryIdSchema,
          rightId: exerciseEntryIdSchema,
        })
      )
      .min(MIN_MATCH_PAIRS, `MATCH_CLICK exige no minimo ${MIN_MATCH_PAIRS} pares`)
      .max(MAX_MATCH_PAIRS, `MATCH_CLICK aceita no maximo ${MAX_MATCH_PAIRS} pares`),
  })
  .superRefine((data, ctx) => {
    addIssueOnDuplicate(
      data.pairs.map((pair) => pair.leftId),
      ctx,
      ['pairs'],
      'leftId repetido: a equivalencia e 1:1, nao um-para-muitos'
    );
    addIssueOnDuplicate(
      data.pairs.map((pair) => pair.rightId),
      ctx,
      ['pairs'],
      'rightId repetido: a equivalencia e 1:1, nao um-para-muitos'
    );
  });

// ---------------------------------------------------------------------------
// Uniao discriminada e regras cruzadas
// ---------------------------------------------------------------------------

const multipleChoiceItemSchema = z.object({
  kind: z.literal('MULTIPLE_CHOICE'),
  payload: multipleChoicePayloadSchema,
  answerKey: multipleChoiceAnswerKeySchema,
});

const matchClickItemSchema = z.object({
  kind: z.literal('MATCH_CLICK'),
  payload: matchClickPayloadSchema,
  answerKey: matchClickAnswerKeySchema,
});

const textChoiceItemSchema = z.object({
  kind: z.literal('TEXT_CHOICE'),
  payload: textChoicePayloadSchema,
  answerKey: textChoiceAnswerKeySchema,
});

const verbClozeItemSchema = z.object({
  kind: z.literal('VERB_CLOZE'),
  payload: verbClozePayloadSchema,
  answerKey: verbClozeAnswerKeySchema,
});

/**
 * Item completo, com `payload` e `answerKey` juntos.
 *
 * As regras abaixo sao as que so existem com as duas colunas na mao. `VERB_CLOZE`
 * nao aparece porque nao tem nem pode ter regra cruzada: o `answerKey` dele
 * guarda texto canonico, nao referencia posicao nem id do `payload`.
 */
export const exerciseItemContentSchema = z
  .discriminatedUnion('kind', [
    multipleChoiceItemSchema,
    matchClickItemSchema,
    textChoiceItemSchema,
    verbClozeItemSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.kind === 'MULTIPLE_CHOICE' || data.kind === 'TEXT_CHOICE') {
      if (data.answerKey.correctIndex >= data.payload.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answerKey', 'correctIndex'],
          message: `Gabarito ${data.answerKey.correctIndex} fora da faixa de ${data.payload.options.length} alternativas`,
        });
      }
      return;
    }

    if (data.kind === 'MATCH_CLICK') {
      if (data.answerKey.pairs.length !== data.payload.left.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answerKey', 'pairs'],
          message: `Gabarito tem ${data.answerKey.pairs.length} pares para ${data.payload.left.length} entradas`,
        });
      }

      const leftIds = new Set(data.payload.left.map((entry) => entry.id));
      const rightIds = new Set(data.payload.right.map((entry) => entry.id));

      data.answerKey.pairs.forEach((pair, index) => {
        if (!leftIds.has(pair.leftId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['answerKey', 'pairs', index, 'leftId'],
            message: `leftId ${pair.leftId} nao existe na coluna left`,
          });
        }
        if (!rightIds.has(pair.rightId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['answerKey', 'pairs', index, 'rightId'],
            message: `rightId ${pair.rightId} nao existe na coluna right`,
          });
        }
      });
    }
  });

/**
 * Schemas por kind, para quem ja sabe o `kind` e precisa validar uma coluna
 * `Json` isolada (o service que grava, a migration que valida o que ja esta em
 * disco). Quem tem as duas colunas usa `exerciseItemContentSchema`, que e o
 * unico lugar onde a regra cruzada roda.
 */
export const EXERCISE_ITEM_SCHEMAS_BY_KIND = {
  MULTIPLE_CHOICE: {
    payload: multipleChoicePayloadSchema,
    answerKey: multipleChoiceAnswerKeySchema,
  },
  MATCH_CLICK: {
    payload: matchClickPayloadSchema,
    answerKey: matchClickAnswerKeySchema,
  },
  TEXT_CHOICE: {
    payload: textChoicePayloadSchema,
    answerKey: textChoiceAnswerKeySchema,
  },
  VERB_CLOZE: {
    payload: verbClozePayloadSchema,
    answerKey: verbClozeAnswerKeySchema,
  },
} as const;

// ---------------------------------------------------------------------------
// Tipos derivados (nenhum escrito a mao)
// ---------------------------------------------------------------------------

export type ExerciseItemKind = z.infer<typeof exerciseItemKindSchema>;
export type Phase1ExerciseItemKind = (typeof PHASE_1_EXERCISE_ITEM_KINDS)[number];
export type VerbTense = z.infer<typeof verbTenseSchema>;
export type VerbPerson = z.infer<typeof verbPersonSchema>;
export type MatchEntry = z.infer<typeof matchEntrySchema>;
export type MultipleChoicePayload = z.infer<typeof multipleChoicePayloadSchema>;
export type MultipleChoiceAnswerKey = z.infer<typeof multipleChoiceAnswerKeySchema>;
export type TextChoicePayload = z.infer<typeof textChoicePayloadSchema>;
export type TextChoiceAnswerKey = z.infer<typeof textChoiceAnswerKeySchema>;
export type VerbClozePayload = z.infer<typeof verbClozePayloadSchema>;
export type VerbClozeAnswerKey = z.infer<typeof verbClozeAnswerKeySchema>;
export type MatchClickPayload = z.infer<typeof matchClickPayloadSchema>;
export type MatchClickAnswerKey = z.infer<typeof matchClickAnswerKeySchema>;
export type ExerciseItemContent = z.infer<typeof exerciseItemContentSchema>;
