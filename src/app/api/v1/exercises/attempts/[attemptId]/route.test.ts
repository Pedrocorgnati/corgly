// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({
  getAttemptSummary: vi.fn(),
  closeAttempt: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null) => ({ data, error }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireStudent: mockRequireStudent }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { GET, PATCH } from './route';
import { AppError } from '@/lib/errors';

const STUDENT = { id: 'stu-1', role: 'STUDENT', tokenVersion: 1 };
const params = Promise.resolve({ attemptId: 'at-1' });

function getRequest(exerciseId?: string) {
  const url = new URL('http://localhost/api/v1/exercises/attempts/at-1');
  if (exerciseId) url.searchParams.set('exerciseId', exerciseId);
  return new NextRequest(url, { method: 'GET' });
}

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/exercises/attempts/at-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
});

describe('GET /api/v1/exercises/attempts/[attemptId]', () => {
  it('devolve 401 sem autenticacao e nao acessa o service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const response = await GET(getRequest('ex-1'), { params });

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(mockService.getAttemptSummary).not.toHaveBeenCalled();
  });

  it('devolve 403 para usuario sem papel student e nao acessa o service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const response = await GET(getRequest('ex-1'), { params });

    expect(response.status).toBe(403);
    expect(mockService.getAttemptSummary).not.toHaveBeenCalled();
  });

  it('devolve 400 sem exerciseId', async () => {
    const response = await GET(getRequest(), { params });

    expect(response.status).toBe(400);
    expect(mockService.getAttemptSummary).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a tentativa nao existe ou pertence a outro aluno', async () => {
    mockService.getAttemptSummary.mockRejectedValue(
      new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404),
    );

    const response = await GET(getRequest('ex-1'), { params });

    expect(response.status).toBe(404);
  });

  it('devolve 200 com o resumo escopado ao aluno e exercicio', async () => {
    mockService.getAttemptSummary.mockResolvedValue({ attemptId: 'at-1', status: 'COMPLETED' });

    const response = await GET(getRequest('ex-1'), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attemptId).toBe('at-1');
    expect(mockService.getAttemptSummary).toHaveBeenCalledWith('ex-1', 'at-1', 'stu-1');
  });
});

describe('PATCH /api/v1/exercises/attempts/[attemptId]', () => {
  it('devolve 401 sem autenticacao e nao acessa o service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const response = await PATCH(patchRequest({ action: 'close' }), { params });

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(mockService.closeAttempt).not.toHaveBeenCalled();
  });

  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const response = await PATCH(patchRequest({ action: 'close' }), { params });

    expect(response.status).toBe(403);
    expect(mockService.closeAttempt).not.toHaveBeenCalled();
  });

  it('valida a action', async () => {
    const response = await PATCH(patchRequest({ action: 'invalid' }), { params });

    expect(response.status).toBe(400);
    expect(mockService.closeAttempt).not.toHaveBeenCalled();
  });

  it('fecha sem forcar conclusao', async () => {
    mockService.closeAttempt.mockResolvedValue({
      status: 'IN_PROGRESS',
      score: 0.5,
      scorePercent: 50,
      correctCount: 1,
      answeredCount: 2,
    });

    const response = await PATCH(patchRequest({ action: 'close' }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('IN_PROGRESS');
    expect(mockService.closeAttempt).toHaveBeenCalledWith('at-1', 'stu-1', false);
  });

  it('abandona quando action e abandon', async () => {
    mockService.closeAttempt.mockResolvedValue({ status: 'ABANDONED' });

    await PATCH(patchRequest({ action: 'abandon' }), { params });

    expect(mockService.closeAttempt).toHaveBeenCalledWith('at-1', 'stu-1', true);
  });

  it('devolve 404 quando a tentativa nao existe ou pertence a outro aluno', async () => {
    mockService.closeAttempt.mockRejectedValue(
      new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404),
    );

    const response = await PATCH(patchRequest({ action: 'close' }), { params });

    expect(response.status).toBe(404);
  });

  it('devolve 409 quando a tentativa ja esta finalizada', async () => {
    mockService.closeAttempt.mockRejectedValue(
      new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409),
    );

    const response = await PATCH(patchRequest({ action: 'close' }), { params });

    expect(response.status).toBe(409);
  });
});
