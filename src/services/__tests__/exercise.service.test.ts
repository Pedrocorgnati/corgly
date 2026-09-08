// @vitest-environment node
/**
 * Regras de dominio do ExerciseService.
 *
 * Aqui NAO se testa status HTTP nem envelope - isso e responsabilidade dos
 * `route.test.ts`. O que se prova aqui e o codigo do `AppError`, a ORDEM em que
 * as pre-condicoes disparam, e as tres decisoes que mais custam caro se
 * regredirem: recontagem em vez de incremento, reconciliacao de item por `id`
 * em vez de recriacao, e revogacao sem delecao.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  exercise: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  exerciseTranslation: { deleteMany: vi.fn(), createMany: vi.fn() },
  exerciseItem: { findUnique: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  exerciseAssignment: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  exerciseAttempt: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  exerciseItemAnswer: { upsert: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
}));
const mockAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/audit/audit-logger', () => ({ auditLog: mockAuditLog }));

import { exerciseService, statusForAppError } from '../exercise.service';

const ADMIN = 'admin-1';
const STUDENT = 'stu-1';

function mcItem(position: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'MULTIPLE_CHOICE',
    position,
    payload: { prompt: 'Eu ___ italiano.', options: ['falo', 'fala', 'falam', 'falamos'] },
    answerKey: { correctIndex: 0 },
    ...extra,
  };
}

function createInput(extra: Record<string, unknown> = {}) {
  return {
    internalTitle: 'Presente do indicativo',
    supportLanguage: 'PT_BR',
    level: 1,
    translations: [{ locale: 'PT_BR', title: 'Presente' }],
    items: [mcItem(1)],
    ...extra,
  } as never;
}

/** Roda o callback da transacao contra o proprio mock do prisma. */
function passthroughTransaction() {
  mockPrisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(mockPrisma) : arg,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  passthroughTransaction();
});

describe('statusForAppError', () => {
  it('le o status que o proprio AppError carrega', () => {
    expect(statusForAppError(new AppError('X', 'x', 422))).toBe(422);
    expect(statusForAppError(new AppError('X', 'x', 404))).toBe(404);
  });

  it('trata qualquer outro erro como 500', () => {
    expect(statusForAppError(new Error('boom'))).toBe(500);
    expect(statusForAppError('boom')).toBe(500);
  });
});

describe('create', () => {
  it('recusa idioma de apoio nao publicado com EXERCISE_002', async () => {
    await expect(
      exerciseService.create(createInput({ supportLanguage: 'IT_IT' }), ADMIN),
    ).rejects.toMatchObject({ code: 'EXERCISE_002', status: 422 });

    expect(mockPrisma.exercise.create).not.toHaveBeenCalled();
  });

  it('recusa posicoes nao contiguas com EXERCISE_004', async () => {
    await expect(
      exerciseService.create(createInput({ items: [mcItem(1), mcItem(3)] }), ADMIN),
    ).rejects.toMatchObject({ code: 'EXERCISE_004', status: 422 });
  });

  it('recusa posicao repetida com EXERCISE_004', async () => {
    await expect(
      exerciseService.create(createInput({ items: [mcItem(1), mcItem(1)] }), ADMIN),
    ).rejects.toMatchObject({ code: 'EXERCISE_004', status: 422 });
  });

  // A validacao usa o schema CRUZADO. O mapa por kind nao ve `correctIndex`
  // apontando para alternativa que nao existe, porque olha uma coluna por vez.
  it('recusa gabarito fora da faixa de alternativas com EXERCISE_005', async () => {
    await expect(
      exerciseService.create(
        createInput({ items: [mcItem(1, { answerKey: { correctIndex: 9 } })] }),
        ADMIN,
      ),
    ).rejects.toMatchObject({ code: 'EXERCISE_005', status: 422 });
  });

  it('recusa imagem sem texto alternativo com EXERCISE_005', async () => {
    await expect(
      exerciseService.create(
        createInput({ items: [mcItem(1, { imageAssetId: 'as-1', imageAlt: '  ' })] }),
        ADMIN,
      ),
    ).rejects.toMatchObject({ code: 'EXERCISE_005', status: 422 });
  });

  it('registra auditoria de criacao sem esperar pela escrita', async () => {
    mockPrisma.exercise.create.mockResolvedValue({ id: 'ex-1', items: [{ id: 'it-1' }] });

    await exerciseService.create(createInput(), ADMIN);

    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_CREATE',
      { type: 'Exercise', id: 'ex-1' },
      ADMIN,
      expect.any(Object),
    );
  });
});

describe('update', () => {
  it('recusa item que pertence a outro exercicio com EXERCISE_004', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ id: 'ex-1', items: [{ id: 'it-1' }] });

    await expect(
      exerciseService.update('ex-1', { items: [mcItem(1, { id: 'it-de-outro' })] } as never, ADMIN),
    ).rejects.toMatchObject({ code: 'EXERCISE_004', status: 422 });
  });

  // Recriar tudo cascatearia a delecao para `ExerciseItemAnswer` e apagaria a
  // resposta de quem ja tentou. Item com `id` conhecido tem que ser UPDATE.
  it('atualiza item existente em vez de recriar', async () => {
    mockPrisma.exercise.findUnique
      .mockResolvedValueOnce({ id: 'ex-1', items: [{ id: 'it-1' }] })
      .mockResolvedValueOnce({ id: 'ex-1', items: [] });

    await exerciseService.update('ex-1', { items: [mcItem(1, { id: 'it-1' })] } as never, ADMIN);

    expect(mockPrisma.exerciseItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'it-1' } }),
    );
    expect(mockPrisma.exerciseItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.exerciseItem.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exerciseId: 'ex-1', id: { notIn: ['it-1'] } } }),
    );
  });

  it('cria item novo quando ele chega sem id', async () => {
    mockPrisma.exercise.findUnique
      .mockResolvedValueOnce({ id: 'ex-1', items: [{ id: 'it-1' }] })
      .mockResolvedValueOnce({ id: 'ex-1', items: [] });

    await exerciseService.update(
      'ex-1',
      { items: [mcItem(1, { id: 'it-1' }), mcItem(2)] } as never,
      ADMIN,
    );

    expect(mockPrisma.exerciseItem.create).toHaveBeenCalledTimes(1);
  });

  it('devolve EXERCISE_001 quando o exercicio nao existe', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(null);

    await expect(
      exerciseService.update('sumiu', { internalTitle: 'x' } as never, ADMIN),
    ).rejects.toMatchObject({ code: 'EXERCISE_001', status: 404 });
  });
});

describe('publish', () => {
  const baseExercise = {
    id: 'ex-1',
    status: 'DRAFT',
    supportLanguage: 'EN_US',
    publishedAt: null,
    translations: [
      { locale: 'PT_BR', title: 'Presente' },
      { locale: 'EN_US', title: 'Present' },
    ],
    items: [{ ...mcItem(1), imageAssetId: null, imageAlt: null }],
  };

  it('recusa exercicio arquivado com EXERCISE_007 antes de olhar conteudo', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({
      ...baseExercise,
      status: 'ARCHIVED',
      items: [],
    });

    await expect(exerciseService.publish('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_007',
      status: 409,
    });
  });

  it('recusa exercicio sem itens com EXERCISE_003', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ ...baseExercise, items: [] });

    await expect(exerciseService.publish('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_003',
      status: 422,
    });
  });

  it('recusa quando falta a traducao PT_BR com EXERCISE_006', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({
      ...baseExercise,
      translations: [{ locale: 'EN_US', title: 'Present' }],
    });

    await expect(exerciseService.publish('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_006',
      status: 422,
    });
  });

  it('recusa quando falta a traducao no idioma de apoio com EXERCISE_006', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({
      ...baseExercise,
      translations: [{ locale: 'PT_BR', title: 'Presente' }],
    });

    await expect(exerciseService.publish('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_006',
      status: 422,
    });
  });

  it('publica e carimba publishedAt uma unica vez', async () => {
    const already = new Date('2026-01-01T00:00:00Z');
    mockPrisma.exercise.findUnique.mockResolvedValue({ ...baseExercise, publishedAt: already });
    mockPrisma.exercise.update.mockResolvedValue({ id: 'ex-1', status: 'PUBLISHED' });

    await exerciseService.publish('ex-1', ADMIN);

    expect(mockPrisma.exercise.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PUBLISHED', publishedAt: already } }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_PUBLISH',
      { type: 'Exercise', id: 'ex-1' },
      ADMIN,
      expect.any(Object),
    );
  });
});

describe('archive', () => {
  it('recusa arquivar duas vezes com EXERCISE_007', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ id: 'ex-1', status: 'ARCHIVED' });

    await expect(exerciseService.archive('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_007',
      status: 409,
    });
  });

  it('arquiva e audita', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ id: 'ex-1', status: 'PUBLISHED' });
    mockPrisma.exercise.update.mockResolvedValue({ id: 'ex-1', status: 'ARCHIVED' });

    await exerciseService.archive('ex-1', ADMIN);

    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_ARCHIVE',
      { type: 'Exercise', id: 'ex-1' },
      ADMIN,
      expect.any(Object),
    );
  });
});

describe('grant', () => {
  const PUBLISHED = { id: 'ex-1', status: 'PUBLISHED' };

  it('recusa liberar exercicio nao publicado com ASSIGNMENT_002', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ id: 'ex-1', status: 'DRAFT' });

    await expect(exerciseService.grant('ex-1', ['s1'], ADMIN)).rejects.toMatchObject({
      code: 'ASSIGNMENT_002',
      status: 409,
    });
  });

  it('recusa quem nao e STUDENT com ASSIGNMENT_004 e diz quais ids', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 's1', role: 'ADMIN' }]);

    await expect(exerciseService.grant('ex-1', ['s1', 's2'], ADMIN)).rejects.toMatchObject({
      code: 'ASSIGNMENT_004',
      status: 422,
      details: {
        rejected: [
          { studentId: 's1', reason: 'NOT_STUDENT' },
          { studentId: 's2', reason: 'NOT_FOUND' },
        ],
      },
    });
  });

  // Precedencia: id invalido (erro de selecao) vem ANTES de ja-liberado (no-op
  // benigno). Ao contrario, o admin veria o 409 e nunca o id errado.
  it('reporta ASSIGNMENT_004 antes de ASSIGNMENT_003', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 's1', role: 'STUDENT' }]);

    await expect(exerciseService.grant('ex-1', ['s1', 'fantasma'], ADMIN)).rejects.toMatchObject({
      code: 'ASSIGNMENT_004',
    });

    expect(mockPrisma.exerciseAssignment.findMany).not.toHaveBeenCalled();
  });

  it('recusa aluno ja liberado com ASSIGNMENT_003', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 's1', role: 'STUDENT' }]);
    mockPrisma.exerciseAssignment.findMany.mockResolvedValue([{ studentId: 's1' }]);

    await expect(exerciseService.grant('ex-1', ['s1'], ADMIN)).rejects.toMatchObject({
      code: 'ASSIGNMENT_003',
      status: 409,
    });
  });

  // `upsert` e nao `create`: o par (exerciseId, studentId) e UNIQUE e uma
  // liberacao REVOKED antiga ja ocupa a linha.
  it('reativa liberacao revogada em vez de estourar unicidade', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 's1', role: 'STUDENT' }]);
    mockPrisma.exerciseAssignment.findMany.mockResolvedValue([]);
    mockPrisma.exerciseAssignment.upsert.mockResolvedValue({ id: 'as-1', studentId: 's1' });

    await exerciseService.grant('ex-1', ['s1'], ADMIN);

    expect(mockPrisma.exerciseAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { exerciseId_studentId: { exerciseId: 'ex-1', studentId: 's1' } },
        update: expect.objectContaining({ status: 'ACTIVE', revokedAt: null }),
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_ASSIGN',
      { type: 'ExerciseAssignment', id: 'as-1' },
      ADMIN,
      expect.any(Object),
    );
  });
});

describe('revoke', () => {
  it('devolve ASSIGNMENT_001 quando a liberacao e de outro exercicio', async () => {
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      exerciseId: 'outro',
      studentId: STUDENT,
      status: 'ACTIVE',
    });

    await expect(exerciseService.revoke('ex-1', 'as-1', ADMIN)).rejects.toMatchObject({
      code: 'ASSIGNMENT_001',
      status: 404,
    });
  });

  // Revogar e idempotente e NUNCA deleta: `ExerciseAttempt` aponta para a
  // liberacao e o historico do aluno precisa sobreviver a perda de acesso.
  it('e idempotente quando ja esta revogada', async () => {
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      exerciseId: 'ex-1',
      studentId: STUDENT,
      status: 'REVOKED',
    });

    const result = await exerciseService.revoke('ex-1', 'as-1', ADMIN);

    expect(result.status).toBe('REVOKED');
    expect(mockPrisma.exerciseAssignment.update).not.toHaveBeenCalled();
  });

  it('revoga marcando status, sem apagar a linha', async () => {
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      exerciseId: 'ex-1',
      studentId: STUDENT,
      status: 'ACTIVE',
    });
    mockPrisma.exerciseAssignment.update.mockResolvedValue({ id: 'as-1', status: 'REVOKED' });

    await exerciseService.revoke('ex-1', 'as-1', ADMIN);

    expect(mockPrisma.exerciseAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_REVOKE',
      { type: 'ExerciseAssignment', id: 'as-1' },
      ADMIN,
      expect.any(Object),
    );
  });
});

describe('getPlayableForStudent', () => {
  const PUBLISHED = {
    id: 'ex-1',
    status: 'PUBLISHED',
    supportLanguage: 'EN_US',
    level: 1,
    subject: null,
    timeEstimateMin: null,
    translations: [{ locale: 'PT_BR', title: 'Presente', summary: null }],
    items: [{ id: 'it-1', kind: 'MULTIPLE_CHOICE', position: 1, payload: {} }],
  };

  // 404 antes de 403: responder 403 para id inexistente confirmaria ao aluno
  // que aquele id existe.
  it('devolve EXERCISE_001 quando nao existe, antes de checar liberacao', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(null);

    await expect(exerciseService.getPlayableForStudent('ex-1', STUDENT)).rejects.toMatchObject({
      code: 'EXERCISE_001',
      status: 404,
    });

    expect(mockPrisma.exerciseAssignment.findUnique).not.toHaveBeenCalled();
  });

  it('devolve EXERCISE_001 quando ainda esta em DRAFT', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ ...PUBLISHED, status: 'DRAFT' });

    await expect(exerciseService.getPlayableForStudent('ex-1', STUDENT)).rejects.toMatchObject({
      code: 'EXERCISE_001',
    });
  });

  it('devolve ATTEMPT_004 quando a liberacao esta revogada', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      status: 'REVOKED',
      firstSeenAt: null,
    });

    await expect(exerciseService.getPlayableForStudent('ex-1', STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_004',
      status: 403,
    });
  });

  it('carimba firstSeenAt so na primeira abertura', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      status: 'ACTIVE',
      firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await exerciseService.getPlayableForStudent('ex-1', STUDENT);

    expect(mockPrisma.exerciseAssignment.update).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('answerKey');
  });

  it('escreve firstSeenAt quando ainda e null', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      status: 'ACTIVE',
      firstSeenAt: null,
    });

    await exerciseService.getPlayableForStudent('ex-1', STUDENT);

    expect(mockPrisma.exerciseAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'as-1' } }),
    );
  });

  // O texto que o aluno le sai do idioma DELE, nao do `supportLanguage` do
  // exercicio. Mesma convencao de `src/lib/exercises/lesson-text.ts`.
  it('resolve o titulo pelo preferredLanguage do aluno, nao pelo supportLanguage', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({
      ...PUBLISHED,
      supportLanguage: 'EN_US',
      translations: [
        { locale: 'EN_US', title: 'Present tense', summary: null },
        { locale: 'PT_BR', title: 'Presente do indicativo', summary: null },
      ],
    });
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      status: 'ACTIVE',
      firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'PT_BR' });

    const result = await exerciseService.getPlayableForStudent('ex-1', STUDENT);

    expect(result.title).toBe('Presente do indicativo');
  });

  // `publish` so garante PT_BR + supportLanguage. Aluno em ES_ES num exercicio
  // publicado em PT_BR + EN_US cai no apoio publicado, nao em string vazia.
  it('cai no supportLanguage quando nao ha traducao no idioma do aluno', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({
      ...PUBLISHED,
      supportLanguage: 'EN_US',
      translations: [
        { locale: 'EN_US', title: 'Present tense', summary: null },
        { locale: 'PT_BR', title: 'Presente do indicativo', summary: null },
      ],
    });
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({
      id: 'as-1',
      status: 'ACTIVE',
      firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'ES_ES' });

    const result = await exerciseService.getPlayableForStudent('ex-1', STUDENT);

    expect(result.title).toBe('Present tense');
  });
});

describe('listForStudent', () => {
  it('resolve o titulo da listagem pelo preferredLanguage do aluno', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'PT_BR' });
    mockPrisma.exerciseAssignment.count.mockResolvedValue(1);
    mockPrisma.exerciseAssignment.findMany.mockResolvedValue([
      {
        grantedAt: new Date('2026-01-01T00:00:00Z'),
        firstSeenAt: null,
        exercise: {
          id: 'ex-1',
          supportLanguage: 'EN_US',
          level: 1,
          subject: null,
          translations: [
            { locale: 'EN_US', title: 'Present tense', summary: null },
            { locale: 'PT_BR', title: 'Presente do indicativo', summary: null },
          ],
          items: [{ id: 'it-1' }],
          attempts: [],
        },
      },
    ]);

    const result = await exerciseService.listForStudent(STUDENT, {
      page: 1,
      limit: 20,
    } as never);

    expect(result.items[0].title).toBe('Presente do indicativo');
  });
});

describe('startOrResumeAttempt', () => {
  const PUBLISHED = { id: 'ex-1', status: 'PUBLISHED', items: [{ id: 'a' }, { id: 'b' }] };

  it('devolve ATTEMPT_004 sem liberacao ACTIVE', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue(null);

    await expect(exerciseService.startOrResumeAttempt('ex-1', STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_004',
      status: 403,
    });
  });

  it('retoma a tentativa aberta em vez de criar outra', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({ id: 'as-1', status: 'ACTIVE' });
    mockPrisma.exerciseAttempt.findFirst.mockResolvedValue({ id: 'at-1', status: 'IN_PROGRESS' });

    const result = await exerciseService.startOrResumeAttempt('ex-1', STUDENT);

    expect(result.resumed).toBe(true);
    expect(mockPrisma.exerciseAttempt.create).not.toHaveBeenCalled();
  });

  // `itemCount` congela o tamanho do exercicio no momento da tentativa: se o
  // admin editar depois, a tentativa antiga continua sendo lida contra o
  // denominador que o aluno viu.
  it('grava itemCount na criacao da tentativa', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue(PUBLISHED);
    mockPrisma.exerciseAssignment.findUnique.mockResolvedValue({ id: 'as-1', status: 'ACTIVE' });
    mockPrisma.exerciseAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.exerciseAttempt.create.mockResolvedValue({ id: 'at-1' });

    const result = await exerciseService.startOrResumeAttempt('ex-1', STUDENT);

    expect(result.resumed).toBe(false);
    expect(mockPrisma.exerciseAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemCount: 2 }) }),
    );
  });
});

describe('submitAnswer', () => {
  const ATTEMPT = {
    id: 'at-1',
    exerciseId: 'ex-1',
    studentId: STUDENT,
    status: 'IN_PROGRESS',
    itemCount: 4,
  };
  const MC_ITEM = {
    id: 'it-1',
    exerciseId: 'ex-1',
    kind: 'MULTIPLE_CHOICE',
    answerKey: { correctIndex: 1 },
    acceptWithoutAccent: false,
  };

  function answer(payload: unknown) {
    return { itemId: 'it-1', answer: payload };
  }

  it('devolve ATTEMPT_001 quando a tentativa e de outro aluno', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue({ ...ATTEMPT, studentId: 'outro' });

    await expect(
      exerciseService.submitAnswer('ex-1', 'at-1', STUDENT, answer({})),
    ).rejects.toMatchObject({ code: 'ATTEMPT_001', status: 404 });
  });

  it('devolve ATTEMPT_002 quando a tentativa ja foi finalizada', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue({ ...ATTEMPT, status: 'COMPLETED' });

    await expect(
      exerciseService.submitAnswer('ex-1', 'at-1', STUDENT, answer({})),
    ).rejects.toMatchObject({ code: 'ATTEMPT_002', status: 409 });
  });

  it('devolve ATTEMPT_003 quando o item e de outro exercicio', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue({ ...MC_ITEM, exerciseId: 'outro' });

    await expect(
      exerciseService.submitAnswer('ex-1', 'at-1', STUDENT, answer({})),
    ).rejects.toMatchObject({ code: 'ATTEMPT_003', status: 422 });
  });

  // O kind vem do BANCO. Confiar no kind enviado pelo cliente deixaria
  // responder multipla escolha como se fosse texto livre e furar a correcao.
  it('valida a resposta contra o kind do banco, nao contra o kind enviado', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MC_ITEM);

    await expect(
      exerciseService.submitAnswer('ex-1', 'at-1', STUDENT, answer({ kind: 'VERB_CLOZE', text: 'falo' })),
    ).rejects.toMatchObject({ code: 'EXERCISE_005', status: 422 });
  });

  it('corrige multipla escolha comparando com correctIndex', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MC_ITEM);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      answeredCount: 1,
      correctCount: 1,
      itemCount: 4,
    });

    const ok = await exerciseService.submitAnswer(
      'ex-1',
      'at-1',
      STUDENT,
      answer({ kind: 'MULTIPLE_CHOICE', selectedIndex: 1 }),
    );

    expect(ok.isCorrect).toBe(true);
    expect(ok.answerKey).toEqual({ correctIndex: 1 });
  });

  it('marca errado quando o indice nao bate', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MC_ITEM);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      answeredCount: 1,
      correctCount: 0,
      itemCount: 4,
    });

    const res = await exerciseService.submitAnswer(
      'ex-1',
      'at-1',
      STUDENT,
      answer({ kind: 'MULTIPLE_CHOICE', selectedIndex: 0 }),
    );

    expect(res.isCorrect).toBe(false);
  });

  it('corrige VERB_CLOZE ignorando acento quando o item permite', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue({
      ...MC_ITEM,
      kind: 'VERB_CLOZE',
      answerKey: { canonical: 'sono', accepted: ['sono io'] },
      acceptWithoutAccent: true,
    });
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      answeredCount: 1,
      correctCount: 1,
      itemCount: 4,
    });

    const res = await exerciseService.submitAnswer(
      'ex-1',
      'at-1',
      STUDENT,
      answer({ kind: 'VERB_CLOZE', text: '  Sono!  ' }),
    );

    expect(res.isCorrect).toBe(true);
  });

  // D8: responder de novo e UPSERT (ha `@@unique([attemptId, itemId])`), e os
  // contadores sao RECONTADOS por `count`. `increment` contaria a segunda
  // resposta do mesmo item como item novo e o aluno terminaria com
  // `answeredCount > itemCount`.
  it('faz upsert e reconta em vez de incrementar', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MC_ITEM);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(2);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      answeredCount: 2,
      correctCount: 2,
      itemCount: 4,
    });

    const res = await exerciseService.submitAnswer(
      'ex-1',
      'at-1',
      STUDENT,
      answer({ kind: 'MULTIPLE_CHOICE', selectedIndex: 1 }),
    );

    expect(mockPrisma.exerciseItemAnswer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attemptId_itemId: { attemptId: 'at-1', itemId: 'it-1' } },
      }),
    );
    expect(mockPrisma.exerciseItemAnswer.count).toHaveBeenCalledTimes(2);
    expect(mockPrisma.exerciseAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { answeredCount: 2, correctCount: 2 } }),
    );
    expect(JSON.stringify(mockPrisma.exerciseAttempt.update.mock.calls)).not.toContain('increment');
    expect(res.itemCount).toBe(4);
  });

  it('nao chama auditLog em mutacao de aluno', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MC_ITEM);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      answeredCount: 1,
      correctCount: 1,
      itemCount: 4,
    });

    await exerciseService.submitAnswer(
      'ex-1',
      'at-1',
      STUDENT,
      answer({ kind: 'MULTIPLE_CHOICE', selectedIndex: 1 }),
    );

    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

describe('finishAttempt', () => {
  const ATTEMPT = {
    id: 'at-1',
    exerciseId: 'ex-1',
    studentId: STUDENT,
    status: 'IN_PROGRESS',
    itemCount: 2,
  };

  it('devolve ATTEMPT_002 ao finalizar duas vezes', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue({ ...ATTEMPT, status: 'COMPLETED' });

    await expect(exerciseService.finishAttempt('ex-1', 'at-1', STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_002',
      status: 409,
    });
  });

  // Terminar com item em branco e permitido: o aluno pode parar no meio e ainda
  // assim ver o que acertou. O score fica pendente ate a regra de pontuacao
  // existir - `null` explicito, nao zero inventado.
  it('finaliza com itens em branco e devolve score pendente', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      id: 'at-1',
      answeredCount: 1,
      correctCount: 1,
      itemCount: 2,
      finishedAt: new Date('2026-09-07T00:00:00Z'),
    });
    mockPrisma.exerciseItem.findMany.mockResolvedValue([
      { id: 'it-1', kind: 'MULTIPLE_CHOICE', position: 1, payload: {}, answerKey: { correctIndex: 0 }, answers: [{ payload: {}, isCorrect: true, answeredAt: new Date() }] },
      { id: 'it-2', kind: 'MULTIPLE_CHOICE', position: 2, payload: {}, answerKey: { correctIndex: 1 }, answers: [] },
    ]);

    const result = await exerciseService.finishAttempt('ex-1', 'at-1', STUDENT);

    expect(result.score).toBeNull();
    expect(result.scorePending).toBe(true);
    expect(result.answeredCount).toBe(1);
    // O item nao respondido volta com answer/isCorrect nulos, e com gabarito.
    expect(result.items[1]).toMatchObject({ answer: null, isCorrect: null, answerKey: { correctIndex: 1 } });
  });
});
