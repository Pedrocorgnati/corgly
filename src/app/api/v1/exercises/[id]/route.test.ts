// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ getPlayableForStudent: vi.fn() }));

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

import { GET } from './route';
import { AppError } from '@/lib/errors';

const STUDENT = { id: 'stu-1', role: 'STUDENT', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1' });

function request() {
  return new NextRequest('http://localhost/api/v1/exercises/ex-1', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
});

describe('GET /api/v1/exercises/[id]', () => {
  it('devolve 401 sem autenticacao e nao acessa o service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const res = await GET(request(), { params });

    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(mockService.getPlayableForStudent).not.toHaveBeenCalled();
  });

  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await GET(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.getPlayableForStudent).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o exercicio nao existe ou nao esta publicado', async () => {
    mockService.getPlayableForStudent.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await GET(request(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 403 quando o exercicio existe mas nao esta liberado', async () => {
    mockService.getPlayableForStudent.mockRejectedValue(
      new AppError('ATTEMPT_004', 'Exercicio nao liberado para este aluno.', 403),
    );

    const res = await GET(request(), { params });

    expect(res.status).toBe(403);
  });

  it('devolve 200 com o envelope jogavel e sem gabarito', async () => {
    mockService.getPlayableForStudent.mockResolvedValue({
      id: 'ex-1',
      title: 'Presente',
      items: [{ id: 'it-1', kind: 'MULTIPLE_CHOICE', payload: { options: ['a', 'b', 'c', 'd'] } }],
    });

    const res = await GET(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('answerKey');
    expect(mockService.getPlayableForStudent).toHaveBeenCalledWith('ex-1', 'stu-1');
  });
});
