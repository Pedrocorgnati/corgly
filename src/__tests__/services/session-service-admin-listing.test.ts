// @vitest-environment node
/**
 * FX-12C — `sessionService.listAllForAdmin`, produtor da tabela de sessões do
 * console admin.
 *
 * O defeito coberto aqui: a listagem do admin era montada por `sessionToMeta`,
 * que não emite nome do aluno nem nota. As colunas "Aluno" e "Score" caíam no
 * placeholder em TODAS as linhas — o admin abria a tela para saber de quem era
 * a aula e via traço. Estes testes travam o produtor do dado:
 *
 *  1. a consulta pede as relações `student` e `feedback` (sem `include` não há
 *     nome nem nota para emitir);
 *  2. `studentName` sai preenchido com o nome real do aluno;
 *  3. `score` é a média das 4 dimensões canônicas (listening, speaking,
 *     writing, vocabulary) com 1 casa decimal;
 *  4. `score` é `null` — e só — quando a aula ainda não tem feedback;
 *  5. o filtro `hasFeedback` vira cláusula `where` de verdade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  availabilitySlot: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/credit.service', () => ({
  creditService: {
    consume: vi.fn(),
    refund: vi.fn(),
    getBalance: vi.fn(),
  },
}));

import { SessionService } from '@/services/session.service';

const INICIO = new Date('2026-03-25T14:00:00Z');
const FIM = new Date('2026-03-25T14:50:00Z');
const CRIADO = new Date('2026-03-21T12:00:00Z');

type LinhaOverrides = {
  id?: string;
  studentName?: string;
  feedback?: {
    listeningScore: number;
    speakingScore: number;
    writingScore: number;
    vocabularyScore: number;
  } | null;
};

/**
 * Linha como o Prisma devolve COM o `include` de `listAllForAdmin`. O mock
 * espelha o contrato real: `student` é relação obrigatória no schema, então
 * chega sempre; `feedback` é 1-1 opcional e pode ser `null`.
 */
function linhaDoPrisma(overrides: LinhaOverrides = {}) {
  return {
    id: overrides.id ?? 'session-1',
    studentId: 'student-1',
    availabilitySlotId: 'slot-1',
    startAt: INICIO,
    endAt: FIM,
    status: 'COMPLETED',
    creditBatchId: 'batch-1',
    isRecurring: false,
    recurringPatternId: null,
    cancelledAt: null,
    cancelledBy: null,
    completedAt: FIM,
    extendedBy: null,
    reminderSentAt: null,
    rescheduleRequestSlotId: null,
    createdAt: CRIADO,
    updatedAt: CRIADO,
    student: { name: overrides.studentName ?? 'Ana Souza' },
    feedback: overrides.feedback === undefined ? null : overrides.feedback,
  };
}

describe('SessionService.listAllForAdmin (tabela de sessões do admin)', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((arr: unknown) =>
      Promise.all(arr as Promise<unknown>[]),
    );
    mockPrisma.session.count.mockResolvedValue(1);
  });

  it('pede as relações student e feedback ao Prisma', async () => {
    mockPrisma.session.findMany.mockResolvedValue([linhaDoPrisma()]);

    await service.listAllForAdmin({ page: 1, limit: 20 });

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          student: { select: { name: true } },
          feedback: {
            select: {
              listeningScore: true,
              speakingScore: true,
              writingScore: true,
              vocabularyScore: true,
            },
          },
        },
      }),
    );
  });

  it('emite o nome do aluno em cada linha (coluna "Aluno")', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      linhaDoPrisma({ id: 's-1', studentName: 'Ana Souza' }),
      linhaDoPrisma({ id: 's-2', studentName: 'Bruno Lima' }),
    ]);
    mockPrisma.session.count.mockResolvedValue(2);

    const resultado = await service.listAllForAdmin({ page: 1, limit: 20 });

    expect(resultado.data.map((linha) => linha.studentName)).toEqual([
      'Ana Souza',
      'Bruno Lima',
    ]);
  });

  it('score é a média das 4 dimensões canônicas com 1 casa decimal', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      linhaDoPrisma({
        feedback: {
          listeningScore: 4,
          speakingScore: 5,
          writingScore: 4,
          vocabularyScore: 4,
        },
      }),
    ]);

    const resultado = await service.listAllForAdmin({});

    // (4 + 5 + 4 + 4) / 4 = 4.25 -> 4.3
    expect(resultado.data[0]?.score).toBe(4.3);
  });

  it('score é null quando a aula ainda não tem feedback', async () => {
    mockPrisma.session.findMany.mockResolvedValue([linhaDoPrisma({ feedback: null })]);

    const resultado = await service.listAllForAdmin({});

    expect(resultado.data[0]?.score).toBeNull();
    // O nome continua chegando: "sem feedback" não pode apagar o aluno.
    expect(resultado.data[0]?.studentName).toBe('Ana Souza');
  });

  it('mantém os campos de SessionWithMeta (não é um payload paralelo)', async () => {
    mockPrisma.session.findMany.mockResolvedValue([linhaDoPrisma()]);

    const resultado = await service.listAllForAdmin({});
    const linha = resultado.data[0];

    expect(linha?.id).toBe('session-1');
    expect(linha?.startAt).toBe(INICIO.toISOString());
    expect(linha?.endAt).toBe(FIM.toISOString());
    expect(linha?.status).toBe('COMPLETED');
    expect(linha?.studentId).toBe('student-1');
  });

  it('hasFeedback=true filtra só as aulas já avaliadas', async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);
    mockPrisma.session.count.mockResolvedValue(0);

    await service.listAllForAdmin({ hasFeedback: true });

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ feedback: { isNot: null } }) }),
    );
    expect(mockPrisma.session.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ feedback: { isNot: null } }),
    });
  });

  it('hasFeedback=false filtra só as aulas pendentes de avaliação', async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);
    mockPrisma.session.count.mockResolvedValue(0);

    await service.listAllForAdmin({ hasFeedback: false });

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ feedback: { is: null } }) }),
    );
  });

  it('sem hasFeedback não filtra por feedback nenhum', async () => {
    mockPrisma.session.findMany.mockResolvedValue([linhaDoPrisma()]);

    await service.listAllForAdmin({ status: 'COMPLETED' });

    const chamada = mockPrisma.session.findMany.mock.calls[0]?.[0] as { where: object };
    expect(chamada.where).not.toHaveProperty('feedback');
    expect(chamada.where).toMatchObject({ status: 'COMPLETED' });
  });

  it('pagina de verdade: skip/take derivam de page/limit e totalPages do total', async () => {
    mockPrisma.session.findMany.mockResolvedValue([linhaDoPrisma()]);
    mockPrisma.session.count.mockResolvedValue(45);

    const resultado = await service.listAllForAdmin({ page: 3, limit: 20 });

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(resultado.page).toBe(3);
    expect(resultado.totalPages).toBe(3);
    expect(resultado.total).toBe(45);
  });
});
