/**
 * Schemas de ROTA do dominio de exercicios.
 *
 * Divisao de responsabilidade, para nao existirem duas fontes da mesma regra:
 *
 * - `src/lib/exercises/exercise-item.schema.ts` guarda a FORMA de `payload` e
 *   `answerKey` por kind, incluindo as regras cruzadas entre os dois. Aquilo e
 *   contrato de dado e vale para qualquer produtor (rota, seed, migration).
 * - Este arquivo guarda o ENVELOPE que a rota recebe: filtros de listagem,
 *   metadados do item que nao sao nem payload nem gabarito (posicao, midia,
 *   tolerancia a acento), o exercicio inteiro e a resposta do aluno.
 *
 * Falha aqui e sempre 400 (payload malformado). Regra de negocio recuperavel
 * (posicao nao contigua, traducao faltando, `imageAlt` ausente com imagem
 * anexada) vive no service e sai como 422 com codigo do catalogo. Por isso este
 * arquivo NAO tenta reproduzir aquelas checagens: duplicar mudaria o status HTTP
 * observado pelo cliente.
 */

import { z } from 'zod';
import {
  MAX_MATCH_PAIRS,
  MIN_MATCH_PAIRS,
  PHASE_1_EXERCISE_ITEM_KINDS,
  exerciseEntryIdSchema,
  exerciseItemContentSchema,
} from '@/lib/exercises';

// ---------------------------------------------------------------------------
// Primitivas compartilhadas
// ---------------------------------------------------------------------------

const SUPPORT_LANGUAGES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;
const EXERCISE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/**
 * Idiomas de apoio que a fonte publica. `IT_IT` fica de fora.
 *
 * Esta lista NAO estreita o schema de criacao de proposito. Recusar `IT_IT` no
 * schema devolveria 400 ("payload malformado"), e a regra e recuperavel: o
 * admin escolheu um idioma que existe no enum do banco e a fonte nao publica.
 * Quem recusa e o service, com `EXERCISE_002` / 422. O consumidor desta
 * constante e `exercise.service.ts`.
 */
export const PUBLISHABLE_SUPPORT_LANGUAGES = ['PT_BR', 'EN_US', 'ES_ES'] as const;

export type PublishableSupportLanguage = (typeof PUBLISHABLE_SUPPORT_LANGUAGES)[number];

/** Idioma de traducao: aqui o set completo vale, inclusive para leitura de exercicio antigo. */
export const exerciseLocaleSchema = z.enum(SUPPORT_LANGUAGES);

export const exerciseStatusSchema = z.enum(EXERCISE_STATUSES);

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

/**
 * Query da biblioteca do admin. Tudo opcional: a tela abre sem filtro nenhum.
 *
 * `coerce` nos numericos porque `URLSearchParams` entrega string sempre; sem
 * ele `page=2` reprovaria como "esperava number".
 */
export const exerciseListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  level: z.coerce.number().int().min(0).max(100).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  supportLanguage: exerciseLocaleSchema.optional(),
  status: exerciseStatusSchema.optional(),
  tag: z.string().trim().min(1).max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExerciseListQuery = z.infer<typeof exerciseListQuerySchema>;

/**
 * Query da lista do aluno. Sem `status` (o aluno so ve PUBLISHED liberado para
 * ele) e sem `supportLanguage` como filtro de escolha do cliente.
 */
export const studentExerciseListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  level: z.coerce.number().int().min(0).max(100).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StudentExerciseListQuery = z.infer<typeof studentExerciseListQuerySchema>;

// ---------------------------------------------------------------------------
// Item de exercicio (envelope + conteudo)
// ---------------------------------------------------------------------------

/**
 * Metadados do item que NAO fazem parte do par payload/answerKey.
 *
 * `id` e opcional e existe por causa da reconciliacao do PATCH: item que ja
 * esta no banco chega com `id` e e atualizado; item sem `id` e criado; item do
 * banco ausente da lista e apagado. Sem carregar o identificador ate o service
 * a unica reconciliacao possivel seria apagar tudo e recriar, o que derrubaria
 * em cascata `ExerciseItemAnswer` de tentativas ja respondidas.
 */
const exerciseItemMetaSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(1, 'Posicao comeca em 1'),
  acceptWithoutAccent: z.boolean().default(false),
  maxSeconds: z.number().int().min(1).max(600).optional().nullable(),
  promptAudioAssetId: z.string().uuid().optional().nullable(),
  answerAudioAssetId: z.string().uuid().optional().nullable(),
  imageAssetId: z.string().uuid().optional().nullable(),
  imageAlt: z.string().trim().max(300).optional().nullable(),
});

/**
 * Item completo aceito pela rota.
 *
 * `z.intersection` e nao `.extend()`: `exerciseItemContentSchema` e uma uniao
 * discriminada embrulhada em `superRefine`, ou seja um `ZodEffects`, e
 * `ZodEffects` nao expoe `.extend()`. A intersecao roda os dois lados e funde
 * os objetos resultantes, preservando as regras cruzadas do lado do conteudo.
 */
export const exerciseItemInputSchema = z.intersection(
  exerciseItemContentSchema,
  exerciseItemMetaSchema,
);

export type ExerciseItemInput = z.infer<typeof exerciseItemInputSchema>;

// ---------------------------------------------------------------------------
// Exercicio
// ---------------------------------------------------------------------------

export const exerciseTranslationInputSchema = z.object({
  locale: exerciseLocaleSchema,
  title: z.string().trim().min(1, 'Titulo obrigatorio').max(200, 'Titulo excede 200 caracteres'),
  summary: z.string().trim().max(2000).optional().nullable(),
});

export const createExerciseSchema = z.object({
  internalTitle: z
    .string()
    .trim()
    .min(1, 'Titulo interno obrigatorio')
    .max(200, 'Titulo interno excede 200 caracteres'),
  // Set completo: a recusa de `IT_IT` e 422 no service, nao 400 aqui.
  supportLanguage: exerciseLocaleSchema,
  level: z.number().int().min(0).max(100),
  subject: z.string().trim().max(80).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  timeEstimateMin: z.number().int().min(1).max(600).optional().nullable(),
  translations: z.array(exerciseTranslationInputSchema).min(1, 'Pelo menos uma traducao'),
  items: z.array(exerciseItemInputSchema).min(1, 'Exercicio precisa de pelo menos um item'),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

/**
 * PATCH parcial. `items` continua opcional: quem nao manda a chave nao mexe nos
 * itens; quem manda um array substitui a lista inteira por reconciliacao no
 * service. Array vazio nao passa aqui porque exercicio sem item nao publica.
 */
export const updateExerciseSchema = createExerciseSchema.partial();

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const createAssignmentSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'Selecione pelo menos um aluno').max(200),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

// ---------------------------------------------------------------------------
// Resposta do aluno
// ---------------------------------------------------------------------------

/**
 * A resposta do aluno tem forma propria por kind e NAO e o `answerKey`.
 * `MULTIPLE_CHOICE` e `TEXT_CHOICE` mandam o indice clicado, `VERB_CLOZE` manda
 * o texto digitado (comparado depois por `matchesAnswerKey`) e `MATCH_CLICK`
 * manda os pares montados.
 */
const multipleChoiceAnswerSchema = z.object({
  kind: z.literal('MULTIPLE_CHOICE'),
  selectedIndex: z.number().int().min(0, 'selectedIndex deve ser >= 0'),
});

const textChoiceAnswerSchema = z.object({
  kind: z.literal('TEXT_CHOICE'),
  selectedIndex: z.number().int().min(0, 'selectedIndex deve ser >= 0'),
});

const verbClozeAnswerSchema = z.object({
  kind: z.literal('VERB_CLOZE'),
  text: z.string().trim().min(1, 'Resposta obrigatoria').max(120, 'Resposta excede 120 caracteres'),
});

const matchClickAnswerSchema = z
  .object({
    kind: z.literal('MATCH_CLICK'),
    pairs: z
      .array(
        z.object({
          leftId: z.string().trim().min(1).max(64),
          rightId: z.string().trim().min(1).max(64),
        }),
      )
      .min(MIN_MATCH_PAIRS, `MATCH_CLICK exige no minimo ${MIN_MATCH_PAIRS} pares`)
      .max(MAX_MATCH_PAIRS, `MATCH_CLICK aceita no maximo ${MAX_MATCH_PAIRS} pares`),
  })
  .superRefine((data, ctx) => {
    const leftSeen = new Set<string>();
    const rightSeen = new Set<string>();

    data.pairs.forEach((pair, index) => {
      if (leftSeen.has(pair.leftId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pairs', index, 'leftId'],
          message: 'leftId repetido: a equivalencia e 1:1',
        });
      }
      leftSeen.add(pair.leftId);

      if (rightSeen.has(pair.rightId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pairs', index, 'rightId'],
          message: 'rightId repetido: a equivalencia e 1:1',
        });
      }
      rightSeen.add(pair.rightId);
    });
  });

/** Uniao usada quando o `kind` vem no proprio corpo da resposta. */
export const exerciseAnswerContentSchema = z.discriminatedUnion('kind', [
  multipleChoiceAnswerSchema,
  textChoiceAnswerSchema,
  verbClozeAnswerSchema,
]);

/**
 * Schemas por kind, para o service que ja leu `ExerciseItem.kind` do banco e
 * precisa validar o `answer` cru contra o tipo certo. E este mapa, e nao a
 * uniao acima, que a rota de resposta usa: confiar no `kind` que o cliente
 * manda permitiria responder um item de multipla escolha como se fosse texto.
 */
export const EXERCISE_ANSWER_SCHEMAS_BY_KIND = {
  MULTIPLE_CHOICE: multipleChoiceAnswerSchema,
  TEXT_CHOICE: textChoiceAnswerSchema,
  VERB_CLOZE: verbClozeAnswerSchema,
  MATCH_CLICK: matchClickAnswerSchema,
} as const;

export type ExerciseAnswerKind = keyof typeof EXERCISE_ANSWER_SCHEMAS_BY_KIND;

/**
 * Envelope do POST de resposta. O campo e `answer` (nao `payload`): `payload` e
 * o nome da coluna que guarda o dado no banco, e usar a mesma palavra no corpo
 * da requisicao sugeriria que o cliente escreve a coluna direto.
 */
export const submitAnswerSchema = z.object({
  itemId: z.string().uuid('itemId invalido'),
  answer: z.unknown(),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

/** Candidato isolado de MATCH_CLICK. Nao aceita kind, gabarito nem contadores. */
export const matchPairCandidateSchema = z
  .object({
    leftId: exerciseEntryIdSchema,
    rightId: exerciseEntryIdSchema,
  })
  .strict();

export type MatchPairCandidate = z.infer<typeof matchPairCandidateSchema>;

/** Kinds que a Fase 1 sabe corrigir. Reexportado para a rota nao importar dois barris. */
export const SUPPORTED_ANSWER_KINDS = PHASE_1_EXERCISE_ITEM_KINDS;
