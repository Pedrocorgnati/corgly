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
import { Prisma } from '@prisma/client';
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

describe('listForAdmin', () => {
  it('combina busca e cinco filtros, pagina de modo estável e monta o DTO sem N+1', async () => {
    const updatedAt = new Date('2026-09-08T12:00:00.000Z');
    const where = {
      internalTitle: { contains: 'passado' },
      level: 2,
      subject: { contains: 'Gramática' },
      supportLanguage: 'EN_US',
      status: 'PUBLISHED',
      tags: { array_contains: 'A2' },
    };

    mockPrisma.exercise.count.mockResolvedValue(42);
    mockPrisma.exercise.findMany.mockResolvedValue([
      {
        id: 'ex-1',
        internalTitle: 'Passado composto',
        supportLanguage: 'EN_US',
        level: 2,
        subject: 'Gramática',
        tags: ['A2', 'verbos'],
        status: 'PUBLISHED',
        updatedAt,
        translations: [
          { locale: 'PT_BR', title: 'Passado composto' },
          { locale: 'EN_US', title: 'Present perfect' },
        ],
        items: [
          { kind: 'TEXT_CHOICE', position: 3 },
          { kind: 'MATCH_CLICK', position: 1 },
          { kind: 'TEXT_CHOICE', position: 2 },
        ],
      },
      {
        id: 'ex-2',
        internalTitle: 'Sem tradução de apoio',
        supportLanguage: 'ES_ES',
        level: 2,
        subject: null,
        tags: { inesperado: true },
        status: 'DRAFT',
        updatedAt,
        translations: [{ locale: 'PT_BR', title: 'Somente português' }],
        items: [],
      },
    ]);
    mockPrisma.exerciseAssignment.groupBy.mockResolvedValue([
      { exerciseId: 'ex-1', _count: { _all: 3 } },
    ]);

    const result = await exerciseService.listForAdmin({
      q: 'passado',
      level: 2,
      subject: 'Gramática',
      supportLanguage: 'EN_US',
      status: 'PUBLISHED',
      tag: 'A2',
      page: 3,
      limit: 10,
    });

    expect(mockPrisma.exercise.count).toHaveBeenCalledWith({ where });
    expect(mockPrisma.exercise.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: 20,
      take: 10,
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
        items: {
          select: { kind: true, position: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    expect(mockPrisma.exerciseAssignment.groupBy).toHaveBeenCalledOnce();
    expect(mockPrisma.exerciseAssignment.groupBy).toHaveBeenCalledWith({
      by: ['exerciseId'],
      where: { exerciseId: { in: ['ex-1', 'ex-2'] }, status: 'ACTIVE' },
      _count: { _all: true },
    });

    expect(result).toStrictEqual({
      total: 42,
      page: 3,
      limit: 10,
      items: [
        {
          id: 'ex-1',
          internalTitle: 'Passado composto',
          studentTitle: 'Present perfect',
          predominantKind: 'TEXT_CHOICE',
          supportLanguage: 'EN_US',
          level: 2,
          subject: 'Gramática',
          tags: ['A2', 'verbos'],
          itemCount: 3,
          status: 'PUBLISHED',
          activeAssignmentCount: 3,
          updatedAt,
        },
        {
          id: 'ex-2',
          internalTitle: 'Sem tradução de apoio',
          studentTitle: null,
          predominantKind: null,
          supportLanguage: 'ES_ES',
          level: 2,
          subject: null,
          tags: [],
          itemCount: 0,
          status: 'DRAFT',
          activeAssignmentCount: 0,
          updatedAt,
        },
      ],
    });
    expect(Object.keys(result.items[0] ?? {})).toHaveLength(12);
    expect(result.items[0]).not.toHaveProperty('actions');
    expect(result.items[0]).not.toHaveProperty('publishedAt');
  });

  it('não consulta contagens de assignments quando a página está vazia', async () => {
    mockPrisma.exercise.count.mockResolvedValue(0);
    mockPrisma.exercise.findMany.mockResolvedValue([]);

    await expect(
      exerciseService.listForAdmin({ page: 1, limit: 20 }),
    ).resolves.toStrictEqual({ total: 0, page: 1, limit: 20, items: [] });

    expect(mockPrisma.exerciseAssignment.groupBy).not.toHaveBeenCalled();
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

    await expect(exerciseService.archive('ex-1', ADMIN)).resolves.toStrictEqual({
      id: 'ex-1',
      status: 'ARCHIVED',
    });

    expect(mockPrisma.exercise.update).toHaveBeenCalledWith({
      where: { id: 'ex-1', status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_ARCHIVE',
      { type: 'Exercise', id: 'ex-1' },
      ADMIN,
      expect.any(Object),
    );
  });

  it('devolve conflito e nao duplica auditoria quando outra transicao vence o archive', async () => {
    mockPrisma.exercise.findUnique.mockResolvedValue({ id: 'ex-1', status: 'PUBLISHED' });
    mockPrisma.exercise.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Registro alterado', {
        code: 'P2025',
        clientVersion: '5.22.0',
      }),
    );

    await expect(exerciseService.archive('ex-1', ADMIN)).rejects.toMatchObject({
      code: 'EXERCISE_007',
      status: 409,
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
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
    expect(mockAuditLog).not.toHaveBeenCalled();
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
      expect.objectContaining({
        where: { id: 'as-1', exerciseId: 'ex-1', status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'REVOKED' }),
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      'EXERCISE_REVOKE',
      { type: 'ExerciseAssignment', id: 'as-1' },
      ADMIN,
      expect.any(Object),
    );
  });

  it('trata revoke concorrente ja convergido como no-op sem auditoria duplicada', async () => {
    mockPrisma.exerciseAssignment.findUnique
      .mockResolvedValueOnce({
        id: 'as-1',
        exerciseId: 'ex-1',
        studentId: STUDENT,
        status: 'ACTIVE',
      })
      .mockResolvedValueOnce({
        id: 'as-1',
        exerciseId: 'ex-1',
        studentId: STUDENT,
        status: 'REVOKED',
      });
    mockPrisma.exerciseAssignment.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Registro alterado', {
        code: 'P2025',
        clientVersion: '5.22.0',
      }),
    );

    await expect(exerciseService.revoke('ex-1', 'as-1', ADMIN)).resolves.toMatchObject({
      id: 'as-1',
      status: 'REVOKED',
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
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

  it('cai em PT_BR, nunca no supportLanguage, quando falta o idioma do aluno', async () => {
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

    expect(result.title).toBe('Presente do indicativo');
  });
});

describe('listForStudent', () => {
  const grantedAt = new Date('2026-01-01T00:00:00.000Z');
  const seenAt = new Date('2026-01-02T00:00:00.000Z');

  function assignment(
    translations: Array<{ locale: string; title: string; summary: string | null }>,
    exerciseOverrides: Record<string, unknown> = {},
  ) {
    return {
      id: 'assignment-id-must-not-leak',
      grantedAt,
      firstSeenAt: seenAt,
      exercise: {
        id: 'exercise-id',
        supportLanguage: 'ES_ES',
        level: 2,
        subject: 'Gramática',
        translations,
        items: [{ kind: 'MULTIPLE_CHOICE', position: 1 }],
        attempts: [],
        ...exerciseOverrides,
      },
    };
  }

  async function listWith(
    readerLocale: string | null,
    translations: Array<{ locale: string; title: string; summary: string | null }>,
    exerciseOverrides: Record<string, unknown> = {},
  ) {
    mockPrisma.user.findUnique.mockResolvedValue({ preferredLanguage: readerLocale });
    mockPrisma.exerciseAssignment.count.mockResolvedValue(1);
    mockPrisma.exerciseAssignment.findMany.mockResolvedValue([
      assignment(translations, exerciseOverrides),
    ]);

    return exerciseService.listForStudent(STUDENT, { page: 1, limit: 20 });
  }

  it('limita a consulta ao aluno, ACTIVE e PUBLISHED sem qualquer predicado de idioma', async () => {
    await listWith('EN_US', [
      { locale: 'PT_BR', title: 'Português', summary: null },
      { locale: 'EN_US', title: 'English', summary: null },
    ]);

    const where = {
      studentId: STUDENT,
      status: 'ACTIVE',
      exercise: {
        status: 'PUBLISHED',
        internalTitle: { contains: 'verbos' },
        level: 2,
        subject: { contains: 'Gramática' },
      },
    };

    await exerciseService.listForStudent(STUDENT, {
      q: 'verbos',
      level: 2,
      subject: 'Gramática',
      page: 3,
      limit: 10,
    });

    expect(mockPrisma.exerciseAssignment.count).toHaveBeenLastCalledWith({ where });
    expect(mockPrisma.exerciseAssignment.findMany).toHaveBeenLastCalledWith({
      where,
      orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
      skip: 20,
      take: 10,
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
              where: {
                studentId: STUDENT,
                status: { in: ['IN_PROGRESS', 'COMPLETED'] },
              },
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
    });

    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).not.toContain('preferredLanguage');
    expect(serializedWhere).not.toContain('supportLanguage');
    expect(serializedWhere).not.toContain('locale');
  });

  it('usa Exercise.id, o helper predominante e o snapshot da tentativa mais recente sem N+1', async () => {
    const result = await listWith(
      'PT_BR',
      [{ locale: 'PT_BR', title: 'Exercício', summary: 'Resumo' }],
      {
        items: [
          { kind: 'MATCH_CLICK', position: 1 },
          { kind: 'TEXT_CHOICE', position: 3 },
          { kind: 'TEXT_CHOICE', position: 2 },
          { kind: 'MULTIPLE_CHOICE', position: 4 },
        ],
        attempts: [
          {
            status: 'IN_PROGRESS',
            answeredCount: 2,
            correctCount: 1,
            itemCount: 7,
          },
        ],
      },
    );

    expect(result).toStrictEqual({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'exercise-id',
          title: 'Exercício',
          summary: 'Resumo',
          predominantKind: 'TEXT_CHOICE',
          supportLanguage: 'ES_ES',
          level: 2,
          subject: 'Gramática',
          itemCount: 4,
          firstSeenAt: seenAt,
          grantedAt,
          latestAttempt: {
            status: 'IN_PROGRESS',
            answeredCount: 2,
            correctCount: 1,
            itemCount: 7,
          },
        },
      ],
    });
    expect(result.items[0]?.id).not.toBe('assignment-id-must-not-leak');
    expect(result.items[0]?.itemCount).toBe(4);
    expect(result.items[0]?.latestAttempt?.itemCount).toBe(7);
    expect(mockPrisma.exerciseAssignment.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.exerciseAttempt.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['PT_BR', 'Português'],
    ['EN_US', 'English'],
    ['ES_ES', 'Español'],
  ])('%s tenta o próprio locale antes de PT_BR', async (locale, expectedTitle) => {
    const result = await listWith(locale, [
      { locale: 'IT_IT', title: 'Prima voce', summary: null },
      { locale: 'PT_BR', title: 'Português', summary: null },
      { locale: 'EN_US', title: 'English', summary: null },
      { locale: 'ES_ES', title: 'Español', summary: null },
    ]);

    expect(result.items[0]?.title).toBe(expectedTitle);
  });

  it.each(['EN_US', 'ES_ES'])('%s cai em PT_BR quando o próprio locale falta', async (locale) => {
    const result = await listWith(locale, [
      { locale: 'IT_IT', title: 'Nunca usar a primeira', summary: null },
      { locale: 'PT_BR', title: 'Fallback português', summary: null },
    ]);

    expect(result.items[0]?.title).toBe('Fallback português');
  });

  it('IT_IT tenta EN_US e ignora a tradução italiana', async () => {
    const result = await listWith('IT_IT', [
      { locale: 'IT_IT', title: 'Italiano ignorado', summary: null },
      { locale: 'PT_BR', title: 'Português', summary: null },
      { locale: 'EN_US', title: 'English for Italian reader', summary: null },
    ]);

    expect(result.items[0]?.title).toBe('English for Italian reader');
  });

  it('IT_IT cai em PT_BR quando EN_US falta', async () => {
    const result = await listWith('IT_IT', [
      { locale: 'IT_IT', title: 'Italiano ignorado', summary: null },
      { locale: 'PT_BR', title: 'Fallback português', summary: null },
    ]);

    expect(result.items[0]?.title).toBe('Fallback português');
  });

  it.each([null, 'DE_DE'])('%s usa somente PT_BR', async (locale) => {
    const result = await listWith(locale, [
      { locale: 'EN_US', title: 'Nunca usar a primeira', summary: null },
      { locale: 'PT_BR', title: 'Português canônico', summary: null },
    ]);

    expect(result.items[0]?.title).toBe('Português canônico');
  });

  it('lança EXERCISE_006/422 quando a cadeia precisa de PT_BR e ele falta', async () => {
    await expect(
      listWith('ES_ES', [
        { locale: 'IT_IT', title: 'Primeira proibida', summary: null },
        { locale: 'EN_US', title: 'Support language proibido', summary: null },
      ], { supportLanguage: 'EN_US' }),
    ).rejects.toMatchObject({ code: 'EXERCISE_006', status: 422 });
  });

  it('o locale do leitor não altera os ids pertencentes ao aluno', async () => {
    const translations = [
      { locale: 'PT_BR', title: 'Português', summary: null },
      { locale: 'EN_US', title: 'English', summary: null },
    ];
    const inPortuguese = await listWith('PT_BR', translations);
    const inEnglish = await listWith('EN_US', translations);

    expect(inPortuguese.items.map(({ id }) => id)).toEqual(['exercise-id']);
    expect(inEnglish.items.map(({ id }) => id)).toEqual(['exercise-id']);
    expect(mockPrisma.exerciseAssignment.findMany).toHaveBeenCalledTimes(2);
    for (const call of mockPrisma.exerciseAssignment.findMany.mock.calls) {
      expect(call[0]?.where).toEqual({
        studentId: STUDENT,
        status: 'ACTIVE',
        exercise: { status: 'PUBLISHED' },
      });
    }
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
    mockPrisma.exerciseAttempt.findFirst.mockResolvedValue({
      id: 'at-1',
      status: 'IN_PROGRESS',
      answers: [{ itemId: 'b' }],
    });

    const result = await exerciseService.startOrResumeAttempt('ex-1', STUDENT);

    expect(result.resumed).toBe(true);
    expect(result.attempt.answeredItemIds).toEqual(['b']);
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

describe('checkMatchPair', () => {
  const ATTEMPT = {
    id: 'at-1',
    exerciseId: 'ex-1',
    studentId: STUDENT,
    status: 'IN_PROGRESS',
    itemCount: 3,
    answeredCount: 0,
    correctCount: 0,
    finishedAt: null,
  };
  const MATCH_ITEM = {
    id: 'it-match',
    exerciseId: 'ex-1',
    kind: 'MATCH_CLICK',
    payload: {
      left: [
        { id: 'l1', text: 'one' },
        { id: 'l2', text: 'two' },
        { id: 'l3', text: 'three' },
      ],
      right: [
        { id: 'r1', text: 'um' },
        { id: 'r2', text: 'dois' },
        { id: 'r3', text: 'tres' },
      ],
    },
    answerKey: {
      pairs: [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r2' },
        { leftId: 'l3', rightId: 'r3' },
      ],
    },
  };
  const candidate = (extra: Record<string, string> = {}) => ({
    exerciseId: 'ex-1',
    attemptId: 'at-1',
    itemId: 'it-match',
    leftId: 'l1',
    rightId: 'r1',
    ...extra,
  });

  beforeEach(() => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(MATCH_ITEM);
  });

  it('retorna somente isCorrect para um par correto sem persistir nem contar', async () => {
    const result = await exerciseService.checkMatchPair(candidate(), STUDENT);

    expect(result).toEqual({ isCorrect: true });
    expect(Object.keys(result)).toEqual(['isCorrect']);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.exerciseItemAnswer.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.exerciseItemAnswer.count).not.toHaveBeenCalled();
    expect(mockPrisma.exerciseAttempt.update).not.toHaveBeenCalled();
  });

  it('retorna false sem revelar o par correto', async () => {
    const result = await exerciseService.checkMatchPair(
      candidate({ rightId: 'r2' }),
      STUDENT,
    );

    expect(result).toEqual({ isCorrect: false });
    expect(JSON.stringify(result)).not.toContain('r1');
  });

  it('esconde tentativa inexistente ou de outro aluno com 404', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(null);

    await expect(exerciseService.checkMatchPair(candidate(), STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_001',
      status: 404,
    });
    expect(mockPrisma.exerciseItem.findUnique).not.toHaveBeenCalled();
  });

  it('recusa tentativa fora de IN_PROGRESS com 409', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue({
      ...ATTEMPT,
      status: 'COMPLETED',
    });

    await expect(exerciseService.checkMatchPair(candidate(), STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_002',
      status: 409,
    });
    expect(mockPrisma.exerciseItem.findUnique).not.toHaveBeenCalled();
  });

  it('devolve 404 para item inexistente', async () => {
    mockPrisma.exerciseItem.findUnique.mockResolvedValue(null);

    await expect(exerciseService.checkMatchPair(candidate(), STUDENT)).rejects.toMatchObject({
      code: 'MATCH_001',
      status: 404,
    });
  });

  it('recusa item de outro exercicio ou de outro tipo com 422', async () => {
    mockPrisma.exerciseItem.findUnique.mockResolvedValueOnce({
      ...MATCH_ITEM,
      exerciseId: 'ex-2',
    });
    await expect(exerciseService.checkMatchPair(candidate(), STUDENT)).rejects.toMatchObject({
      code: 'ATTEMPT_003',
      status: 422,
    });

    mockPrisma.exerciseItem.findUnique.mockResolvedValueOnce({
      ...MATCH_ITEM,
      kind: 'MULTIPLE_CHOICE',
    });
    await expect(exerciseService.checkMatchPair(candidate(), STUDENT)).rejects.toMatchObject({
      code: 'MATCH_002',
      status: 422,
    });
  });

  it('recusa ids que nao existem nas colunas com 422', async () => {
    await expect(
      exerciseService.checkMatchPair(candidate({ leftId: 'desconhecido' }), STUDENT),
    ).rejects.toMatchObject({ code: 'MATCH_003', status: 422 });
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

  // Uma tentativa parcial continua retomavel; o score e derivado no servidor
  // sem transformar saida no meio em conclusao.
  it('mantem itens em branco em andamento e devolve score derivado', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.exerciseItemAnswer.count.mockResolvedValue(1);
    mockPrisma.exerciseAttempt.update.mockResolvedValue({
      id: 'at-1',
      status: 'IN_PROGRESS',
      answeredCount: 1,
      correctCount: 1,
      itemCount: 2,
      finishedAt: null,
    });
    mockPrisma.exerciseItem.findMany.mockResolvedValue([
      { id: 'it-1', kind: 'MULTIPLE_CHOICE', position: 1, payload: {}, answerKey: { correctIndex: 0 }, answers: [{ payload: {}, isCorrect: true, answeredAt: new Date() }] },
      { id: 'it-2', kind: 'MULTIPLE_CHOICE', position: 2, payload: {}, answerKey: { correctIndex: 1 }, answers: [] },
    ]);

    const result = await exerciseService.finishAttempt('ex-1', 'at-1', STUDENT);

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.score).toBe(1);
    expect(result.scorePercent).toBe(100);
    expect(result.answeredCount).toBe(1);
    // Tentativa ainda em andamento nao revela gabarito de item nao respondido.
    expect(result.items[1]).toMatchObject({ answer: null, isCorrect: null, answerKey: null });
  });
});

describe('getAttemptSummary', () => {
  const ATTEMPT = {
    id: 'at-1',
    exerciseId: 'ex-1',
    studentId: STUDENT,
    status: 'IN_PROGRESS',
    itemCount: 2,
    answeredCount: 1,
    correctCount: 1,
    finishedAt: null,
  };

  it('usa o locale do aluno e esconde gabarito ainda nao respondido', async () => {
    mockPrisma.exerciseAttempt.findUnique.mockResolvedValue(ATTEMPT);
    mockPrisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'EN_US' });
    mockPrisma.exercise.findUnique.mockResolvedValue({
      id: 'ex-1',
      supportLanguage: 'PT_BR',
      translations: [
        { locale: 'PT_BR', title: 'Exercicio em portugues' },
        { locale: 'EN_US', title: 'Exercise in English' },
      ],
    });
    mockPrisma.exerciseItem.findMany.mockResolvedValue([
      {
        id: 'it-1',
        kind: 'MULTIPLE_CHOICE',
        position: 1,
        payload: {},
        answerKey: { correctIndex: 0 },
        answers: [{ payload: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 }, isCorrect: true }],
      },
      {
        id: 'it-2',
        kind: 'MULTIPLE_CHOICE',
        position: 2,
        payload: {},
        answerKey: { correctIndex: 1 },
        answers: [],
      },
    ]);

    const result = await exerciseService.getAttemptSummary('ex-1', 'at-1', STUDENT);

    expect(result.exercise.title).toBe('Exercise in English');
    expect(result.items[0].answerKey).toEqual({ correctIndex: 0 });
    expect(result.items[1]).toMatchObject({
      answerKey: null,
      answer: null,
      isCorrect: null,
    });
    expect(result.attempt.score).toBe(1);
    expect(result.attempt.scorePercent).toBe(100);
  });
});
