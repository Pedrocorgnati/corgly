/**
 * Regras de dominio de exercicios.
 *
 * TODA regra de negocio mora aqui. As 11 rotas de `src/app/api/v1/**` sao
 * cascas: guard, `await params`, rate limit quando existe, `safeParse` do corpo
 * e traducao de `AppError` em status HTTP. Nenhuma rota toca o Prisma.
 *
 * Catalogo de erros deste dominio (codigo -> status):
 *   EXERCISE_001   404  exercicio nao encontrado
 *   EXERCISE_002   422  supportLanguage IT_IT (a fonte nao publica italiano)
 *   EXERCISE_003   422  exercicio sem itens
 *   EXERCISE_004   422  posicoes nao contiguas, repetidas, ou item de outro exercicio
 *   EXERCISE_005   422  payload/answerKey recusados pelo schema do kind, ou midia sem alt
 *   EXERCISE_006   422  falta traducao PT_BR ou traducao no idioma de apoio
 *   EXERCISE_007   409  transicao de status impossivel (arquivado nao volta)
 *   ASSIGNMENT_001 404  liberacao nao encontrada
 *   ASSIGNMENT_002 409  liberar exercicio que nao esta PUBLISHED
 *   ASSIGNMENT_003 409  aluno ja tem liberacao ACTIVE
 *   ASSIGNMENT_004 422  aluno inexistente ou que nao e STUDENT
 *   ATTEMPT_001    404  tentativa inexistente ou de outro aluno
 *   ATTEMPT_002    409  tentativa ja finalizada
 *   ATTEMPT_003    422  item nao pertence ao exercicio da tentativa
 *   ATTEMPT_004    403  aluno sem liberacao ACTIVE
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit/audit-logger';
import {
  EXERCISE_ITEM_SCHEMAS_BY_KIND,
  exerciseItemContentSchema,
  matchesAnswerKey,
  type ExerciseItemKind,
} from '@/lib/exercises';
import type { ExerciseStatus, SupportedLanguage } from '@/lib/constants/enums';
import { getPredominantItemKind } from '@/lib/exercises/predominant-item-kind';
import {
  EXERCISE_ANSWER_SCHEMAS_BY_KIND,
  PUBLISHABLE_SUPPORT_LANGUAGES,
  type CreateExerciseInput,
  type ExerciseListQuery,
  type StudentExerciseListQuery,
  type UpdateExerciseInput,
} from '@/schemas/exercise.schema';

/**
 * Traducao que o ALUNO le, resolvida pelo idioma do LEITOR.
 *
 * O `supportLanguage` do exercicio descreve em que idioma a fonte publicou o
 * apoio, nao em que idioma este aluno le. Resolver o titulo por ele entregava
 * o texto errado ao aluno cujo `preferredLanguage` difere do do exercicio, e
 * contradizia a convencao ja fixada em `src/lib/exercises/lesson-text.ts`
 * (locale do leitor governa o texto do conteudo).
 *
 * PT/EN/ES tentam o idioma do leitor e depois PT; IT usa EN e depois PT.
 * Locale ausente ou desconhecido usa PT. O idioma de apoio do exercicio nao
 * participa dessa escolha, e a ordem recebida das traducoes nunca e fallback.
 */
function pickReaderTranslation<T extends { locale: string }>(
  translations: readonly T[],
  readerLocale: string | null,
): T {
  const requestedLocales =
    readerLocale === 'IT_IT'
      ? (['EN_US', 'PT_BR'] as const)
      : readerLocale === 'EN_US' || readerLocale === 'ES_ES'
        ? ([readerLocale, 'PT_BR'] as const)
        : (['PT_BR'] as const);

  for (const locale of requestedLocales) {
    const translation = translations.find((candidate) => candidate.locale === locale);
    if (translation) return translation;
  }

  throw new AppError(
    'EXERCISE_006',
    'Traducao obrigatoria do exercicio nao encontrada.',
    422,
  );
}

/** `preferredLanguage` do aluno. Ausente (aluno sumiu entre queries) = null. */
async function readerLocaleOf(studentId: string): Promise<string | null> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { preferredLanguage: true },
  });
  return student?.preferredLanguage ?? null;
}

/**
 * Traducao unica de erro de dominio para status HTTP.
 *
 * Le `AppError.status`, que ja foi decidido no lugar onde a regra vive. NAO ha
 * `switch` por codigo aqui de proposito: um `switch` seria uma segunda tabela
 * de status, e as duas divergiriam no primeiro codigo novo.
 */
export function statusForAppError(err: unknown): number {
  return err instanceof AppError ? err.status : 500;
}

/** Unica formula de pontuacao do dominio. `score` e razao; `scorePercent` e exibivel. */
export function deriveAttemptScore(correctCount: number, answeredCount: number) {
  if (answeredCount === 0) return { score: null, scorePercent: null };
  const score = correctCount / answeredCount;
  return { score, scorePercent: Math.round(score * 100) };
}

// ---------------------------------------------------------------------------
// Tipos de saida
// ---------------------------------------------------------------------------

export interface AdminExerciseListRow {
  id: string;
  internalTitle: string;
  studentTitle: string | null;
  predominantKind: ExerciseItemKind | null;
  supportLanguage: SupportedLanguage;
  level: number;
  subject: string | null;
  tags: string[];
  itemCount: number;
  status: ExerciseStatus;
  activeAssignmentCount: number;
  updatedAt: Date;
}

export interface StudentExerciseListRow {
  id: string;
  title: string;
  summary: string | null;
  predominantKind: ExerciseItemKind | null;
  supportLanguage: SupportedLanguage;
  level: number;
  subject: string | null;
  itemCount: number;
  firstSeenAt: Date | null;
  grantedAt: Date;
  latestAttempt: {
    status: 'IN_PROGRESS' | 'COMPLETED';
    answeredCount: number;
    correctCount: number;
    itemCount: number;
  } | null;
}

export interface GrantRejection {
  studentId: string;
  reason: 'NOT_FOUND' | 'NOT_STUDENT' | 'ALREADY_ACTIVE';
}

type ItemContentInput = {
  kind: string;
  payload: unknown;
  answerKey: unknown;
  position: number;
  id?: string;
  acceptWithoutAccent?: boolean;
  maxSeconds?: number | null;
  promptAudioAssetId?: string | null;
  answerAudioAssetId?: string | null;
  imageAssetId?: string | null;
  imageAlt?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers puros de validacao (sem I/O)
// ---------------------------------------------------------------------------

/**
 * Recusa idioma de apoio que a fonte nao publica.
 *
 * 422 e nao 400: o valor existe no enum do banco, o admin so escolheu um que
 * nao vai ao ar. Ele corrige e reenvia.
 */
function assertPublishableSupportLanguage(value: string): void {
  if (!(PUBLISHABLE_SUPPORT_LANGUAGES as readonly string[]).includes(value)) {
    throw new AppError(
      'EXERCISE_002',
      `Idioma de apoio ${value} nao e publicado.`,
      422,
    );
  }
}

/** `position` precisa ser exatamente 1..N, sem buraco e sem empate. */
function assertContiguousPositions(items: readonly { position: number }[]): void {
  const positions = items.map((item) => item.position).sort((a, b) => a - b);

  positions.forEach((position, index) => {
    if (position !== index + 1) {
      throw new AppError(
        'EXERCISE_004',
        `Posicoes dos itens precisam ser 1..${positions.length} sem buraco nem repeticao.`,
        422,
      );
    }
  });
}

/**
 * Roda o schema CRUZADO (`exerciseItemContentSchema`), nao os schemas por kind.
 *
 * O mapa por kind valida cada coluna isolada e por isso NAO enxerga a regra que
 * so existe com as duas na mao: `correctIndex` dentro da faixa de `options`,
 * `pairs` referenciando ids que existem nas colunas. Validar por kind aqui
 * deixaria passar gabarito apontando para alternativa inexistente.
 */
function assertValidItemContent(items: readonly ItemContentInput[]): void {
  items.forEach((item) => {
    const parsed = exerciseItemContentSchema.safeParse({
      kind: item.kind,
      payload: item.payload,
      answerKey: item.answerKey,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError(
        'EXERCISE_005',
        `Item na posicao ${item.position} invalido: ${issue?.message ?? 'conteudo recusado'}`,
        422,
      );
    }
  });
}

/**
 * Imagem anexada exige texto alternativo.
 *
 * A regra vive aqui e NAO no schema da rota: no schema ela sairia como 400
 * ("payload malformado"), e o que aconteceu foi o admin esquecer um campo que
 * ele consegue preencher e reenviar, ou seja 422 recuperavel com codigo do
 * catalogo.
 */
function assertMediaIntegrity(items: readonly ItemContentInput[]): void {
  items.forEach((item) => {
    if (item.imageAssetId && !(item.imageAlt ?? '').trim()) {
      throw new AppError(
        'EXERCISE_005',
        `Item na posicao ${item.position} tem imagem sem texto alternativo.`,
        422,
      );
    }
  });
}

/** Normaliza a coluna Json sem enviar valores inesperados para a biblioteca. */
function stringTags(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : [];
}

/** Compara a resposta do aluno com o gabarito do item. */
function isAnswerCorrect(
  kind: string,
  answerKey: unknown,
  answer: Record<string, unknown>,
  acceptWithoutAccent: boolean,
): boolean {
  const key = answerKey as Record<string, unknown>;

  if (kind === 'MULTIPLE_CHOICE' || kind === 'TEXT_CHOICE') {
    return key.correctIndex === answer.selectedIndex;
  }

  if (kind === 'VERB_CLOZE') {
    return matchesAnswerKey(
      String(answer.text ?? ''),
      {
        canonical: String(key.canonical ?? ''),
        accepted: Array.isArray(key.accepted) ? (key.accepted as string[]) : [],
      },
      { acceptWithoutAccent },
    );
  }

  if (kind === 'MATCH_CLICK') {
    const expected = (key.pairs ?? []) as { leftId: string; rightId: string }[];
    const given = (answer.pairs ?? []) as { leftId: string; rightId: string }[];
    if (expected.length !== given.length) return false;

    const expectedSet = new Set(expected.map((pair) => `${pair.leftId}>${pair.rightId}`));
    return given.every((pair) => expectedSet.has(`${pair.leftId}>${pair.rightId}`));
  }

  return false;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExerciseService {
  // -------------------------------------------------------------------------
  // Leitura administrativa
  // -------------------------------------------------------------------------

  /**
   * Biblioteca do admin.
   *
   * `contains` sem `mode: 'insensitive'`: o conector MySQL do Prisma nao gera
   * esse campo, e a insensibilidade ja vem da collation `utf8mb4_*_ci` da
   * coluna. Passar o campo aqui nem compilaria.
   */
  async listForAdmin(query: ExerciseListQuery) {
    const where: Prisma.ExerciseWhereInput = {
      ...(query.q ? { internalTitle: { contains: query.q } } : {}),
      ...(query.level !== undefined ? { level: query.level } : {}),
      ...(query.subject ? { subject: { contains: query.subject } } : {}),
      ...(query.supportLanguage ? { supportLanguage: query.supportLanguage } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { array_contains: query.tag } } : {}),
    };

    const [total, exercises] = await Promise.all([
      prisma.exercise.count({ where }),
      prisma.exercise.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          internalTitle: true,
          supportLanguage: true,
          level: true,
          subject: true,
          tags: true,
          status: true,
          updatedAt: true,
          translations: { select: { locale: true, title: true } },
          items: { select: { kind: true, position: true }, orderBy: { position: 'asc' } },
        },
      }),
    ]);

    // Contagem de liberacoes SO das ACTIVE. O total cru contaria revogadas e
    // diria ao admin que o exercicio esta liberado para quem ja perdeu acesso.
    const grouped =
      exercises.length === 0
        ? []
        : await prisma.exerciseAssignment.groupBy({
            by: ['exerciseId'],
            where: { exerciseId: { in: exercises.map((e) => e.id) }, status: 'ACTIVE' },
            _count: { _all: true },
          });

    const activeByExercise = new Map(grouped.map((row) => [row.exerciseId, row._count._all]));

    const items: AdminExerciseListRow[] = exercises.map((exercise) => ({
      id: exercise.id,
      internalTitle: exercise.internalTitle,
      studentTitle:
        exercise.translations.find(
          (translation) => translation.locale === exercise.supportLanguage,
        )?.title ?? null,
      predominantKind: getPredominantItemKind(exercise.items),
      supportLanguage: exercise.supportLanguage,
      level: exercise.level,
      subject: exercise.subject,
      tags: stringTags(exercise.tags),
      itemCount: exercise.items.length,
      status: exercise.status,
      activeAssignmentCount: activeByExercise.get(exercise.id) ?? 0,
      updatedAt: exercise.updatedAt,
    }));

    return { total, page: query.page, limit: query.limit, items };
  }

  /** Detalhe do admin: itens COM gabarito, que e exatamente o que o aluno nunca recebe. */
  async getForAdmin(exerciseId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: {
        translations: { orderBy: { locale: 'asc' } },
        items: { orderBy: { position: 'asc' } },
      },
    });

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }

    return exercise;
  }

  // -------------------------------------------------------------------------
  // Mutacoes administrativas do envelope
  // -------------------------------------------------------------------------

  async create(input: CreateExerciseInput, adminId: string) {
    assertPublishableSupportLanguage(input.supportLanguage);
    if (input.items.length === 0) {
      throw new AppError('EXERCISE_003', 'Exercicio precisa de pelo menos um item.', 422);
    }

    const items = input.items as unknown as ItemContentInput[];
    assertContiguousPositions(items);
    assertValidItemContent(items);
    assertMediaIntegrity(items);

    const exercise = await prisma.exercise.create({
      data: {
        internalTitle: input.internalTitle,
        supportLanguage: input.supportLanguage,
        level: input.level,
        subject: input.subject ?? null,
        tags: (input.tags ?? []) as Prisma.InputJsonValue,
        timeEstimateMin: input.timeEstimateMin ?? null,
        createdById: adminId,
        translations: {
          create: input.translations.map((translation) => ({
            locale: translation.locale,
            title: translation.title,
            summary: translation.summary ?? null,
          })),
        },
        items: {
          create: items.map((item) => ({
            kind: item.kind as Prisma.ExerciseItemCreateManyExerciseInput['kind'],
            position: item.position,
            payload: item.payload as Prisma.InputJsonValue,
            answerKey: item.answerKey as Prisma.InputJsonValue,
            acceptWithoutAccent: item.acceptWithoutAccent ?? false,
            maxSeconds: item.maxSeconds ?? null,
            promptAudioAssetId: item.promptAudioAssetId ?? null,
            answerAudioAssetId: item.answerAudioAssetId ?? null,
            imageAssetId: item.imageAssetId ?? null,
            imageAlt: item.imageAlt ?? null,
          })),
        },
      },
      include: { translations: true, items: { orderBy: { position: 'asc' } } },
    });

    auditLog('EXERCISE_CREATE', { type: 'Exercise', id: exercise.id }, adminId, {
      itemCount: exercise.items.length,
    });

    return exercise;
  }

  /**
   * PATCH com reconciliacao de itens por `id`.
   *
   * `deleteMany` + `createMany` seria uma linha mais curta e apagaria em cascata
   * todo `ExerciseItemAnswer` ligado aos itens antigos: tentativa de aluno ja
   * respondida viraria tentativa vazia. Por isso a lista que chega e conciliada:
   * item com `id` conhecido e atualizado, item sem `id` e criado, item do banco
   * que sumiu da lista e apagado.
   */
  async update(exerciseId: string, input: UpdateExerciseInput, adminId: string) {
    const existing = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { items: { select: { id: true } } },
    });

    if (!existing) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }
    if (input.supportLanguage !== undefined) {
      assertPublishableSupportLanguage(input.supportLanguage);
    }

    const incomingItems = input.items as unknown as ItemContentInput[] | undefined;

    if (incomingItems) {
      if (incomingItems.length === 0) {
        throw new AppError('EXERCISE_003', 'Exercicio precisa de pelo menos um item.', 422);
      }

      assertContiguousPositions(incomingItems);
      assertValidItemContent(incomingItems);
      assertMediaIntegrity(incomingItems);

      const knownIds = new Set(existing.items.map((item) => item.id));
      incomingItems.forEach((item) => {
        if (item.id && !knownIds.has(item.id)) {
          throw new AppError(
            'EXERCISE_004',
            `Item ${item.id} nao pertence a este exercicio.`,
            422,
          );
        }
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.exercise.update({
        where: { id: exerciseId },
        data: {
          ...(input.internalTitle !== undefined ? { internalTitle: input.internalTitle } : {}),
          ...(input.supportLanguage !== undefined
            ? { supportLanguage: input.supportLanguage }
            : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.subject !== undefined ? { subject: input.subject ?? null } : {}),
          ...(input.tags !== undefined ? { tags: input.tags as Prisma.InputJsonValue } : {}),
          ...(input.timeEstimateMin !== undefined
            ? { timeEstimateMin: input.timeEstimateMin ?? null }
            : {}),
        },
      });

      if (input.translations) {
        await tx.exerciseTranslation.deleteMany({ where: { exerciseId } });
        await tx.exerciseTranslation.createMany({
          data: input.translations.map((translation) => ({
            exerciseId,
            locale: translation.locale,
            title: translation.title,
            summary: translation.summary ?? null,
          })),
        });
      }

      if (incomingItems) {
        const keptIds = incomingItems
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id));

        await tx.exerciseItem.deleteMany({
          where: { exerciseId, id: { notIn: keptIds.length > 0 ? keptIds : ['__none__'] } },
        });

        for (const item of incomingItems) {
          const data = {
            kind: item.kind as Prisma.ExerciseItemCreateManyExerciseInput['kind'],
            position: item.position,
            payload: item.payload as Prisma.InputJsonValue,
            answerKey: item.answerKey as Prisma.InputJsonValue,
            acceptWithoutAccent: item.acceptWithoutAccent ?? false,
            maxSeconds: item.maxSeconds ?? null,
            promptAudioAssetId: item.promptAudioAssetId ?? null,
            answerAudioAssetId: item.answerAudioAssetId ?? null,
            imageAssetId: item.imageAssetId ?? null,
            imageAlt: item.imageAlt ?? null,
          };

          if (item.id) {
            await tx.exerciseItem.update({ where: { id: item.id }, data });
          } else {
            await tx.exerciseItem.create({ data: { ...data, exerciseId } });
          }
        }
      }
    });

    const updated = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { translations: true, items: { orderBy: { position: 'asc' } } },
    });

    auditLog('EXERCISE_UPDATE', { type: 'Exercise', id: exerciseId }, adminId, {
      itemsReconciled: incomingItems ? incomingItems.length : 0,
    });

    return updated;
  }

  /**
   * Publica. Ordem fixa: existencia (404), transicao (409), depois as seis
   * pre-condicoes de conteudo (422). Inverter mandaria 422 para exercicio que
   * nem existe.
   */
  async publish(exerciseId: string, adminId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { translations: true, items: { orderBy: { position: 'asc' } } },
    });

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }
    if (exercise.status === 'ARCHIVED') {
      throw new AppError('EXERCISE_007', 'Exercicio arquivado nao pode ser publicado.', 409);
    }

    // 1. Idioma de apoio publicavel.
    assertPublishableSupportLanguage(exercise.supportLanguage);

    // 2. Tem item.
    if (exercise.items.length === 0) {
      throw new AppError('EXERCISE_003', 'Exercicio sem itens nao pode ser publicado.', 422);
    }

    const items = exercise.items.map((item) => ({
      kind: item.kind as string,
      payload: item.payload,
      answerKey: item.answerKey,
      position: item.position,
      imageAssetId: item.imageAssetId,
      imageAlt: item.imageAlt,
    }));

    // 3. Posicoes contiguas.
    assertContiguousPositions(items);

    // 4. Conteudo de cada item ainda passa no schema cruzado do kind.
    assertValidItemContent(items);

    // 5. Traducao PT_BR e traducao no idioma de apoio.
    const locales = new Set(exercise.translations.map((translation) => translation.locale));
    if (!locales.has('PT_BR')) {
      throw new AppError('EXERCISE_006', 'Falta a traducao PT_BR.', 422);
    }
    if (!locales.has(exercise.supportLanguage)) {
      throw new AppError(
        'EXERCISE_006',
        `Falta a traducao no idioma de apoio ${exercise.supportLanguage}.`,
        422,
      );
    }

    // 6. Midia integra. Na Fase 1 nenhum dos quatro kinds anexa imagem, entao
    // esta checagem passa por vacuidade; ela fica escrita porque o dia em que
    // um kind com imagem entrar, publicar sem alt seria uma regressao de
    // acessibilidade silenciosa.
    assertMediaIntegrity(items);

    const published = await prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        status: 'PUBLISHED',
        publishedAt: exercise.publishedAt ?? new Date(),
      },
    });

    auditLog('EXERCISE_PUBLISH', { type: 'Exercise', id: exerciseId }, adminId, {
      itemCount: exercise.items.length,
    });

    return published;
  }

  /** Arquiva. 404 antes de 409: exercicio inexistente nao "ja esta arquivado". */
  async archive(exerciseId: string, adminId: string) {
    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }
    if (exercise.status === 'ARCHIVED') {
      throw new AppError('EXERCISE_007', 'Exercicio ja esta arquivado.', 409);
    }

    let archived;
    try {
      // Compare-and-set: a leitura acima fornece o status anterior usado pela
      // auditoria, e o UPDATE somente vence se nenhuma transicao concorrente
      // tiver alterado a mesma linha. Assim, dois archives simultaneos nao
      // conseguem registrar dois eventos EXERCISE_ARCHIVE.
      archived = await prisma.exercise.update({
        where: { id: exerciseId, status: exercise.status },
        data: { status: 'ARCHIVED' },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new AppError(
          'EXERCISE_007',
          'Exercicio alterado por outra operacao. Recarregue e tente novamente.',
          409,
        );
      }
      throw error;
    }

    auditLog('EXERCISE_ARCHIVE', { type: 'Exercise', id: exerciseId }, adminId, {
      previousStatus: exercise.status,
    });

    return archived;
  }

  // -------------------------------------------------------------------------
  // Liberacoes
  // -------------------------------------------------------------------------

  async listAssignments(exerciseId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true },
    });

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }

    return prisma.exerciseAssignment.findMany({
      where: { exerciseId },
      orderBy: { grantedAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        status: true,
        grantedAt: true,
        revokedAt: true,
        firstSeenAt: true,
        student: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Libera o exercicio para uma selecao de alunos, tudo ou nada.
   *
   * A selecao inteira e pre-validada ANTES de escrever: liberar metade e
   * devolver erro deixaria o admin sem saber o que aconteceu com a outra
   * metade. `ASSIGNMENT_004` (aluno invalido, 422) tem precedencia sobre
   * `ASSIGNMENT_003` (ja liberado, 409): o primeiro e erro de selecao e o
   * segundo e no-op benigno; reportar o 409 antes esconderia o id errado.
   */
  async grant(exerciseId: string, studentIds: string[], adminId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, status: true },
    });

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }
    if (exercise.status !== 'PUBLISHED') {
      throw new AppError(
        'ASSIGNMENT_002',
        'So exercicio publicado pode ser liberado para alunos.',
        409,
      );
    }

    const uniqueIds = Array.from(new Set(studentIds));

    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, role: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    const invalid: GrantRejection[] = [];
    uniqueIds.forEach((studentId) => {
      const user = byId.get(studentId);
      if (!user) {
        invalid.push({ studentId, reason: 'NOT_FOUND' });
        return;
      }
      if (user.role !== 'STUDENT') {
        invalid.push({ studentId, reason: 'NOT_STUDENT' });
      }
    });

    if (invalid.length > 0) {
      throw new AppError(
        'ASSIGNMENT_004',
        'Selecao contem alunos invalidos.',
        422,
        { rejected: invalid },
      );
    }

    const active = await prisma.exerciseAssignment.findMany({
      where: { exerciseId, studentId: { in: uniqueIds }, status: 'ACTIVE' },
      select: { studentId: true },
    });

    if (active.length > 0) {
      throw new AppError(
        'ASSIGNMENT_003',
        'Selecao contem alunos que ja tem este exercicio liberado.',
        409,
        { rejected: active.map((row) => ({ studentId: row.studentId, reason: 'ALREADY_ACTIVE' })) },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      // Revalidacao DENTRO da transacao: entre a checagem acima e este ponto
      // outro admin pode ter liberado o mesmo aluno.
      const raced = await tx.exerciseAssignment.findMany({
        where: { exerciseId, studentId: { in: uniqueIds }, status: 'ACTIVE' },
        select: { studentId: true },
      });

      if (raced.length > 0) {
        throw new AppError(
          'ASSIGNMENT_003',
          'Selecao contem alunos que ja tem este exercicio liberado.',
          409,
          { rejected: raced.map((row) => ({ studentId: row.studentId, reason: 'ALREADY_ACTIVE' })) },
        );
      }

      const rows = [];
      for (const studentId of uniqueIds) {
        // `upsert` e nao `create`: o par (exerciseId, studentId) e UNIQUE e uma
        // liberacao REVOKED antiga ocupa a linha. Reativar e o comportamento
        // certo, criar seria violacao de unicidade.
        rows.push(
          await tx.exerciseAssignment.upsert({
            where: { exerciseId_studentId: { exerciseId, studentId } },
            create: { exerciseId, studentId, grantedById: adminId, status: 'ACTIVE' },
            update: { status: 'ACTIVE', grantedById: adminId, grantedAt: new Date(), revokedAt: null },
          }),
        );
      }
      return rows;
    });

    created.forEach((assignment) => {
      auditLog('EXERCISE_ASSIGN', { type: 'ExerciseAssignment', id: assignment.id }, adminId, {
        exerciseId,
        studentId: assignment.studentId,
      });
    });

    return created;
  }

  /**
   * Revoga. Nunca apaga: `ExerciseAttempt` aponta para a liberacao e o historico
   * do aluno tem que sobreviver a perda de acesso.
   */
  async revoke(exerciseId: string, assignmentId: string, adminId: string) {
    const assignment = await prisma.exerciseAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, exerciseId: true, studentId: true, status: true },
    });

    if (!assignment || assignment.exerciseId !== exerciseId) {
      throw new AppError('ASSIGNMENT_001', 'Liberacao nao encontrada.', 404);
    }

    if (assignment.status === 'REVOKED') {
      return assignment;
    }

    let revoked;
    try {
      revoked = await prisma.exerciseAssignment.update({
        where: { id: assignmentId, exerciseId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        const converged = await prisma.exerciseAssignment.findUnique({
          where: { id: assignmentId },
          select: { id: true, exerciseId: true, studentId: true, status: true },
        });
        if (converged?.exerciseId === exerciseId && converged.status === 'REVOKED') {
          return converged;
        }
        throw new AppError('ASSIGNMENT_001', 'Liberacao nao encontrada.', 404);
      }
      throw error;
    }

    auditLog('EXERCISE_REVOKE', { type: 'ExerciseAssignment', id: assignmentId }, adminId, {
      exerciseId,
      studentId: assignment.studentId,
    });

    return revoked;
  }

  // -------------------------------------------------------------------------
  // Leitura do aluno
  // -------------------------------------------------------------------------

  async listForStudent(studentId: string, query: StudentExerciseListQuery) {
    const where: Prisma.ExerciseAssignmentWhereInput = {
      studentId,
      status: 'ACTIVE',
      exercise: {
        status: 'PUBLISHED',
        ...(query.q ? { internalTitle: { contains: query.q } } : {}),
        ...(query.level !== undefined ? { level: query.level } : {}),
        ...(query.subject ? { subject: { contains: query.subject } } : {}),
      },
    };

    const [readerLocale, total, assignments] = await Promise.all([
      readerLocaleOf(studentId),
      prisma.exerciseAssignment.count({ where }),
      prisma.exerciseAssignment.findMany({
        where,
        orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          grantedAt: true,
          firstSeenAt: true,
          exercise: {
            select: {
              id: true,
              supportLanguage: true,
              level: true,
              subject: true,
              translations: { select: { locale: true, title: true, summary: true } },
              items: {
                select: { kind: true, position: true },
                orderBy: { position: 'asc' },
              },
              attempts: {
                where: { studentId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
                orderBy: { startedAt: 'desc' },
                take: 1,
                select: {
                  status: true,
                  answeredCount: true,
                  correctCount: true,
                  itemCount: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items: StudentExerciseListRow[] = assignments.map((assignment) => {
      const exercise = assignment.exercise;
      const translation = pickReaderTranslation(
        exercise.translations,
        readerLocale,
      );
      const attempt = exercise.attempts[0];
      const latestAttempt =
        attempt && (attempt.status === 'IN_PROGRESS' || attempt.status === 'COMPLETED')
          ? {
              status: attempt.status,
              answeredCount: attempt.answeredCount,
              correctCount: attempt.correctCount,
              itemCount: attempt.itemCount,
            }
          : null;

      return {
        id: exercise.id,
        title: translation.title,
        summary: translation.summary ?? null,
        predominantKind: getPredominantItemKind(exercise.items),
        supportLanguage: exercise.supportLanguage,
        level: exercise.level,
        subject: exercise.subject,
        itemCount: exercise.items.length,
        firstSeenAt: assignment.firstSeenAt,
        grantedAt: assignment.grantedAt,
        latestAttempt,
      };
    });

    return { total, page: query.page, limit: query.limit, items };
  }

  /**
   * Envelope jogavel. Existencia (404) e checada ANTES da liberacao (403):
   * responder 403 para id inexistente confirmaria ao aluno que o id existe.
   *
   * `answerKey` NAO sai daqui. O gabarito so aparece depois de responder
   * (`POST .../answers`) ou de finalizar (`POST .../finish`).
   */
  async getPlayableForStudent(exerciseId: string, studentId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: {
        id: true,
        status: true,
        supportLanguage: true,
        level: true,
        subject: true,
        timeEstimateMin: true,
        translations: { select: { locale: true, title: true, summary: true } },
        items: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            kind: true,
            position: true,
            payload: true,
            acceptWithoutAccent: true,
            maxSeconds: true,
            promptAudioAssetId: true,
            answerAudioAssetId: true,
            imageAssetId: true,
            imageAlt: true,
          },
        },
      },
    });

    if (!exercise || exercise.status !== 'PUBLISHED') {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }

    const assignment = await prisma.exerciseAssignment.findUnique({
      where: { exerciseId_studentId: { exerciseId, studentId } },
      select: { id: true, status: true, firstSeenAt: true },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      throw new AppError('ATTEMPT_004', 'Exercicio nao liberado para este aluno.', 403);
    }

    // Selo "Novo": carimba a primeira abertura e nunca reescreve.
    if (assignment.firstSeenAt === null) {
      await prisma.exerciseAssignment.update({
        where: { id: assignment.id },
        data: { firstSeenAt: new Date() },
      });
    }

    const translation = pickReaderTranslation(
      exercise.translations,
      await readerLocaleOf(studentId),
    );

    return {
      id: exercise.id,
      title: translation.title,
      summary: translation.summary ?? null,
      supportLanguage: exercise.supportLanguage,
      level: exercise.level,
      subject: exercise.subject,
      timeEstimateMin: exercise.timeEstimateMin,
      itemCount: exercise.items.length,
      items: exercise.items,
    };
  }

  // -------------------------------------------------------------------------
  // Tentativa
  // -------------------------------------------------------------------------

  /**
   * Comeca ou retoma. Retomar e o caminho normal, nao conflito: o aluno que
   * fecha a aba no meio precisa voltar para a mesma tentativa. Por isso esta
   * operacao nao tem 409.
   */
  async startOrResumeAttempt(exerciseId: string, studentId: string) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, status: true, items: { select: { id: true } } },
    });

    if (!exercise || exercise.status !== 'PUBLISHED') {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }

    const assignment = await prisma.exerciseAssignment.findUnique({
      where: { exerciseId_studentId: { exerciseId, studentId } },
      select: { id: true, status: true },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      throw new AppError('ATTEMPT_004', 'Exercicio nao liberado para este aluno.', 403);
    }

    const open = await prisma.exerciseAttempt.findFirst({
      where: { exerciseId, studentId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      include: { answers: { select: { itemId: true } } },
    });

    if (open) {
      const { answers, ...attempt } = open;
      return {
        attempt: {
          ...attempt,
          answeredItemIds: (answers ?? []).map((answer) => answer.itemId),
        },
        resumed: true,
      };
    }

    // `itemCount` e escrito UMA vez, aqui, e nunca reescrito: ele congela o
    // tamanho do exercicio no momento da tentativa. Se o admin editar o
    // exercicio depois, a tentativa antiga continua sendo lida contra o
    // denominador que o aluno de fato viu.
    const attempt = await prisma.exerciseAttempt.create({
      data: {
        exerciseId,
        studentId,
        assignmentId: assignment.id,
        itemCount: exercise.items.length,
      },
    });

    return { attempt: { ...attempt, answeredItemIds: [] }, resumed: false };
  }

  /** Carrega e valida a tentativa como pertencente ao aluno sem revelar ids alheios. */
  private async loadOwnAttemptById(attemptId: string, studentId: string) {
    const attempt = await prisma.exerciseAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        exerciseId: true,
        studentId: true,
        status: true,
        itemCount: true,
        answeredCount: true,
        correctCount: true,
        finishedAt: true,
      },
    });

    // Tentativa de outro aluno responde 404, nao 403: 403 confirmaria que a
    // tentativa existe.
    if (!attempt || attempt.studentId !== studentId) {
      throw new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404);
    }

    return attempt;
  }

  /** Carrega e valida tambem a relacao com o exercicio presente na URL. */
  private async loadOwnAttempt(exerciseId: string, attemptId: string, studentId: string) {
    const attempt = await this.loadOwnAttemptById(attemptId, studentId);
    if (attempt.exerciseId !== exerciseId) {
      throw new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404);
    }
    return attempt;
  }

  /**
   * Valida um unico candidato de MATCH_CLICK sem gravar resposta, alterar
   * contador ou devolver qualquer parte do gabarito.
   */
  async checkMatchPair(
    input: {
      exerciseId: string;
      attemptId: string;
      itemId: string;
      leftId: string;
      rightId: string;
    },
    studentId: string,
  ): Promise<{ isCorrect: boolean }> {
    const attempt = await this.loadOwnAttempt(
      input.exerciseId,
      input.attemptId,
      studentId,
    );

    if (attempt.status !== 'IN_PROGRESS') {
      throw new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409);
    }

    const item = await prisma.exerciseItem.findUnique({
      where: { id: input.itemId },
      select: {
        id: true,
        exerciseId: true,
        kind: true,
        payload: true,
        answerKey: true,
      },
    });

    if (!item) {
      throw new AppError('MATCH_001', 'Item nao encontrado.', 404);
    }
    if (item.exerciseId !== attempt.exerciseId) {
      throw new AppError('ATTEMPT_003', 'Item nao pertence a este exercicio.', 422);
    }
    if (item.kind !== 'MATCH_CLICK') {
      throw new AppError('MATCH_002', 'Item nao aceita validacao de pares.', 422);
    }

    const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.payload.safeParse(item.payload);
    const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.answerKey.safeParse(
      item.answerKey,
    );
    if (!payload.success || !answerKey.success) {
      throw new AppError('EXERCISE_005', 'Conteudo MATCH_CLICK invalido.', 422);
    }

    const leftExists = payload.data.left.some((entry) => entry.id === input.leftId);
    const rightExists = payload.data.right.some((entry) => entry.id === input.rightId);
    if (!leftExists || !rightExists) {
      throw new AppError('MATCH_003', 'Candidato contem ids inexistentes.', 422);
    }

    return {
      isCorrect: answerKey.data.pairs.some(
        (pair) => pair.leftId === input.leftId && pair.rightId === input.rightId,
      ),
    };
  }

  /**
   * Grava a resposta de um item.
   *
   * Responder de novo e `upsert`, porque `@@unique([attemptId, itemId])` diz que
   * ha no maximo uma resposta por item. Os contadores da tentativa sao
   * RECONTADOS por `count` dentro da mesma transacao, nunca incrementados:
   * `increment` sobre um upsert contaria a segunda resposta do mesmo item como
   * item novo e o aluno terminaria com `answeredCount > itemCount`.
   */
  async submitAnswer(
    exerciseId: string,
    attemptId: string,
    studentId: string,
    input: { itemId: string; answer: unknown },
  ) {
    const attempt = await this.loadOwnAttempt(exerciseId, attemptId, studentId);

    if (attempt.status !== 'IN_PROGRESS') {
      throw new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409);
    }

    const item = await prisma.exerciseItem.findUnique({
      where: { id: input.itemId },
      select: {
        id: true,
        exerciseId: true,
        kind: true,
        answerKey: true,
        acceptWithoutAccent: true,
      },
    });

    if (!item || item.exerciseId !== attempt.exerciseId) {
      throw new AppError('ATTEMPT_003', 'Item nao pertence a este exercicio.', 422);
    }

    // O `kind` vem do BANCO, nao do corpo da requisicao: confiar no kind
    // enviado pelo cliente deixaria responder multipla escolha como se fosse
    // texto e furar a correcao.
    const schema =
      EXERCISE_ANSWER_SCHEMAS_BY_KIND[item.kind as keyof typeof EXERCISE_ANSWER_SCHEMAS_BY_KIND];

    if (!schema) {
      throw new AppError('EXERCISE_005', `Tipo de item ${item.kind} nao aceita resposta ainda.`, 422);
    }

    const parsed = schema.safeParse(input.answer);
    if (!parsed.success) {
      throw new AppError(
        'EXERCISE_005',
        parsed.error.issues[0]?.message ?? 'Resposta invalida para este tipo de item.',
        422,
      );
    }

    const answer = parsed.data as unknown as Record<string, unknown>;
    const isCorrect = isAnswerCorrect(
      item.kind,
      item.answerKey,
      answer,
      item.acceptWithoutAccent,
    );

    const result = await prisma.$transaction(async (tx) => {
      await tx.exerciseItemAnswer.upsert({
        where: { attemptId_itemId: { attemptId, itemId: item.id } },
        create: {
          attemptId,
          itemId: item.id,
          payload: answer as Prisma.InputJsonValue,
          isCorrect,
        },
        update: {
          payload: answer as Prisma.InputJsonValue,
          isCorrect,
          answeredAt: new Date(),
        },
      });

      const [answeredCount, correctCount] = await Promise.all([
        tx.exerciseItemAnswer.count({ where: { attemptId } }),
        tx.exerciseItemAnswer.count({ where: { attemptId, isCorrect: true } }),
      ]);

      return tx.exerciseAttempt.update({
        where: { id: attemptId },
        data: { answeredCount, correctCount },
        select: { answeredCount: true, correctCount: true, itemCount: true },
      });
    });

    // O gabarito volta AQUI de proposito: o feedback imediato e o produto.
    // O que nao pode e ele viajar no envelope jogavel, antes de responder.
    return {
      isCorrect,
      answerKey: item.answerKey,
      answeredCount: result.answeredCount,
      correctCount: result.correctCount,
      itemCount: result.itemCount,
    };
  }

  /** Fecha sem forcar conclusao, ou abandona explicitamente quando `force=true`. */
  async closeAttempt(attemptId: string, studentId: string, force = false) {
    const attempt = await this.loadOwnAttemptById(attemptId, studentId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409);
    }

    const closed = await prisma.$transaction(async (tx) => {
      const [answeredCount, correctCount] = await Promise.all([
        tx.exerciseItemAnswer.count({ where: { attemptId } }),
        tx.exerciseItemAnswer.count({ where: { attemptId, isCorrect: true } }),
      ]);

      const status = force
        ? 'ABANDONED'
        : answeredCount === attempt.itemCount
          ? 'COMPLETED'
          : 'IN_PROGRESS';

      return tx.exerciseAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          finishedAt: status === 'IN_PROGRESS' ? null : new Date(),
          answeredCount,
          correctCount,
        },
        select: {
          id: true,
          status: true,
          answeredCount: true,
          correctCount: true,
          itemCount: true,
          finishedAt: true,
        },
      });
    });

    return { ...closed, ...deriveAttemptScore(closed.correctCount, closed.answeredCount) };
  }

  /** Finaliza o fluxo e devolve a revisao completa com score derivado no servidor. */
  async finishAttempt(exerciseId: string, attemptId: string, studentId: string) {
    const attempt = await this.loadOwnAttempt(exerciseId, attemptId, studentId);
    const closed = await this.closeAttempt(attemptId, studentId);

    const items = await prisma.exerciseItem.findMany({
      where: { exerciseId: attempt.exerciseId },
      orderBy: { position: 'asc' },
      take: attempt.itemCount,
      select: {
        id: true,
        kind: true,
        position: true,
        payload: true,
        answerKey: true,
        answers: {
          where: { attemptId },
          select: { payload: true, isCorrect: true, answeredAt: true },
        },
      },
    });

    return {
      attemptId: closed.id,
      status: closed.status,
      answeredCount: closed.answeredCount,
      correctCount: closed.correctCount,
      itemCount: closed.itemCount,
      finishedAt: closed.finishedAt,
      score: closed.score,
      scorePercent: closed.scorePercent,
      items: items.map((item) => {
        const answer = item.answers[0];
        return {
          id: item.id,
          kind: item.kind,
          position: item.position,
          payload: item.payload,
          answerKey: closed.status === 'IN_PROGRESS' && !answer ? null : item.answerKey,
          answer: answer?.payload ?? null,
          isCorrect: answer?.isCorrect ?? null,
          answeredAt: answer?.answeredAt ?? null,
        };
      }),
    };
  }

  /**
   * Busca o resumo de uma tentativa ja finalizada ou em andamento.
   *
   * Usado pela pagina de resumo para mostrar o score e os itens revisaveis.
   * Nao modifica o estado da tentativa.
   */
  async getAttemptSummary(exerciseId: string, attemptId: string, studentId: string) {
    const attempt = await this.loadOwnAttempt(exerciseId, attemptId, studentId);

    const [exercise, readerLocale] = await Promise.all([
      prisma.exercise.findUnique({
        where: { id: exerciseId },
        select: {
          id: true,
          supportLanguage: true,
          translations: { select: { locale: true, title: true } },
        },
      }),
      readerLocaleOf(studentId),
    ]);

    if (!exercise) {
      throw new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404);
    }

    const items = await prisma.exerciseItem.findMany({
      where: { exerciseId: attempt.exerciseId },
      orderBy: { position: 'asc' },
      take: attempt.itemCount,
      select: {
        id: true,
        kind: true,
        position: true,
        payload: true,
        answerKey: true,
        answers: {
          where: { attemptId },
          select: { payload: true, isCorrect: true, answeredAt: true },
        },
      },
    });

    const translation = pickReaderTranslation(
      exercise.translations,
      readerLocale,
    );

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        answeredCount: attempt.answeredCount,
        correctCount: attempt.correctCount,
        itemCount: attempt.itemCount,
        finishedAt: attempt.finishedAt,
        ...deriveAttemptScore(attempt.correctCount, attempt.answeredCount),
      },
      exercise: {
        id: exercise.id,
        title: translation.title,
      },
      items: items.map((item) => {
        const answer = item.answers[0];
        return {
          id: item.id,
          kind: item.kind,
          position: item.position,
          payload: item.payload,
          answerKey: attempt.status === 'IN_PROGRESS' && !answer ? null : item.answerKey,
          answer: answer?.payload ?? null,
          isCorrect: answer?.isCorrect ?? null,
          answeredAt: answer?.answeredAt ?? null,
        };
      }),
    };
  }
}

export const exerciseService = new ExerciseService();
