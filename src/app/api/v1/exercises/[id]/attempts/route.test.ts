// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ startOrResumeAttempt: vi.fn() }));

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
const params = Promise.resolve({ id: 'ex-1' });

function request() {
  return new NextRequest('http://localhost/api/v1/exercises/ex-1/attempts', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
});

describe('POST /api/v1/exercises/[id]/attempts', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await POST(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o exercicio nao existe ou nao esta publicado', async () => {
    mockService.startOrResumeAttempt.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 403 quando o aluno nao tem liberacao ACTIVE', async () => {
    mockService.startOrResumeAttempt.mockRejectedValue(
      new AppError('ATTEMPT_004', 'Exercicio nao liberado para este aluno.', 403),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(403);
  });

  it('devolve 201 quando cria tentativa nova', async () => {
    mockService.startOrResumeAttempt.mockResolvedValue({
      attempt: { id: 'at-1', status: 'IN_PROGRESS' },
      resumed: false,
    });

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.attempt.id).toBe('at-1');
  });

  // Retomar nao e conflito: esta rota nao tem 409 de proposito. O aluno que
  // fechou a aba no meio volta para a MESMA tentativa.
  it('devolve 200 quando retoma tentativa aberta', async () => {
    mockService.startOrResumeAttempt.mockResolvedValue({
      attempt: { id: 'at-1', status: 'IN_PROGRESS' },
      resumed: true,
    });

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.resumed).toBe(true);
  });
});
