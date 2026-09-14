import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  listForStudent: vi.fn(),
}));

vi.mock('@/lib/data/auth', () => ({ getAuthUser: mocks.getAuthUser }));

vi.mock('@/services/exercise.service', () => ({
  ExerciseService: class {
    listForStudent = mocks.listForStudent;
  },
}));

import { getStudentExercises } from '@/lib/exercises/actions';

const grantedAt = new Date('2026-09-01T12:00:00.000Z');

function row(
  id: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Exercício ${id}`,
    summary: null,
    predominantKind: 'MULTIPLE_CHOICE',
    supportLanguage: 'PT_BR',
    level: 1,
    subject: null,
    itemCount: 4,
    firstSeenAt: new Date('2026-09-02T12:00:00.000Z'),
    grantedAt,
    latestAttempt: null,
    ...extra,
  };
}

describe('getStudentExercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({ id: 'student-authenticated', role: 'STUDENT' });
    mocks.listForStudent.mockResolvedValue({ total: 0, page: 1, limit: 100, items: [] });
  });

  it('preserva o contrato vazio sem autenticação e não consulta dados', async () => {
    mocks.getAuthUser.mockResolvedValue(null);

    await expect(getStudentExercises()).resolves.toEqual([]);

    expect(mocks.listForStudent).not.toHaveBeenCalled();
  });

  it('usa exclusivamente o id do aluno autenticado e preserva os filtros permitidos', async () => {
    await getStudentExercises({ q: 'verbos', level: 2, subject: 'Gramática' });

    expect(mocks.listForStudent).toHaveBeenCalledWith('student-authenticated', {
      q: 'verbos',
      level: 2,
      subject: 'Gramática',
      page: 1,
      limit: 100,
    });
    expect(JSON.stringify(mocks.listForStudent.mock.calls[0])).not.toContain('supportLanguage');
    expect(JSON.stringify(mocks.listForStudent.mock.calls[0])).not.toContain('preferredLanguage');
  });

  it('usa Exercise.id no DTO/link e deriva Novo e NOT_STARTED sem tentativa', async () => {
    mocks.listForStudent.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        row('exercise-1', {
          firstSeenAt: null,
          predominantKind: 'MATCH_CLICK',
        }),
      ],
    });

    await expect(getStudentExercises()).resolves.toStrictEqual([
      {
        id: 'exercise-1',
        exerciseId: 'exercise-1',
        title: 'Exercício exercise-1',
        supportLanguage: 'PT_BR',
        level: 1,
        subject: null,
        itemCount: 4,
        predominantKind: 'MATCH_CLICK',
        isNew: true,
        status: 'NOT_STARTED',
        progress: null,
      },
    ]);
  });

  it('expõe os três contadores congelados da tentativa IN_PROGRESS', async () => {
    mocks.listForStudent.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        row('exercise-progress', {
          itemCount: 9,
          latestAttempt: {
            status: 'IN_PROGRESS',
            answeredCount: 2,
            correctCount: 1,
            itemCount: 5,
          },
        }),
      ],
    });

    const [result] = await getStudentExercises();

    expect(result).toMatchObject({
      id: 'exercise-progress',
      exerciseId: 'exercise-progress',
      status: 'IN_PROGRESS',
      itemCount: 9,
      progress: { answeredCount: 2, correctCount: 1, itemCount: 5 },
    });
    expect(result?.progress?.itemCount).not.toBe(result?.itemCount);
  });

  it('preserva o snapshot também para tentativa COMPLETED', async () => {
    mocks.listForStudent.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        row('exercise-completed', {
          latestAttempt: {
            status: 'COMPLETED',
            answeredCount: 6,
            correctCount: 5,
            itemCount: 6,
          },
        }),
      ],
    });

    expect((await getStudentExercises())[0]).toMatchObject({
      status: 'COMPLETED',
      progress: { answeredCount: 6, correctCount: 5, itemCount: 6 },
    });
  });
});
