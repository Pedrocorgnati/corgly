// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ finishAttempt: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireStudent: mockRequireStudent }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { POST } from './route';
import { AppError } from '@/lib/errors';

const STUDENT = { id: 'stu-1', role: 'STUDENT', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1', attemptId: 'at-1' });

function request() {
  return new NextRequest(
    'http://localhost/api/v1/exercises/ex-1/attempts/at-1/finish',
    { method: 'POST' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
});

describe('POST /api/v1/exercises/[id]/attempts/[attemptId]/finish', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await POST(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.finishAttempt).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a tentativa e de outro aluno', async () => {
    mockService.finishAttempt.mockRejectedValue(
      new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 409 ao finalizar duas vezes', async () => {
    mockService.finishAttempt.mockRejectedValue(
      new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
  });

  it('devolve 200 com a revisao completa, gabarito incluso', async () => {
    mockService.finishAttempt.mockResolvedValue({
      attemptId: 'at-1',
      answeredCount: 2,
      correctCount: 1,
      itemCount: 4,
      score: null,
      scorePending: true,
      items: [{ id: 'it-1', answerKey: { correctIndex: 0 }, isCorrect: true }],
    });

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items[0].answerKey).toEqual({ correctIndex: 0 });
    expect(body.data.score).toBeNull();
    expect(body.data.scorePending).toBe(true);
    expect(mockService.finishAttempt).toHaveBeenCalledWith('ex-1', 'at-1', 'stu-1');
  });
});
