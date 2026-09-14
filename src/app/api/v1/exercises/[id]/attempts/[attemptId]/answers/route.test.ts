// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ submitAnswer: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireStudent: mockRequireStudent }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
// `checkRateLimit` e FAIL-OPEN: sem Redis configurado ele sempre libera. Sem
// este mock o caminho do 429 seria inalcancavel no teste.
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: { EXERCISE_ANSWER_SUBMIT: { maxRequests: 60, windowMs: 60_000 } },
}));
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { POST } from './route';
import { AppError } from '@/lib/errors';

const STUDENT = { id: 'stu-1', role: 'STUDENT', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1', attemptId: 'at-1' });
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const URL = 'http://localhost/api/v1/exercises/ex-1/attempts/at-1/answers';

function request(body: unknown) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 });
});

describe('POST /api/v1/exercises/[id]/attempts/[attemptId]/answers', () => {
  it('devolve 401 antes do limiter e do service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockService.submitAnswer).not.toHaveBeenCalled();
  });

  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(403);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockService.submitAnswer).not.toHaveBeenCalled();
  });

  it('devolve 429 quando o limite por aluno estoura', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(mockService.submitAnswer).not.toHaveBeenCalled();
  });

  // A chave e o userId, nao o IP: escola atras de NAT compartilha IP e um aluno
  // em flood derrubaria a turma inteira.
  it('usa o userId como chave do rate limit', async () => {
    mockService.submitAnswer.mockResolvedValue({ isCorrect: true });

    await POST(request({ itemId: ITEM_ID, answer: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 } }), {
      params,
    });

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'exercise-answer:stu-1',
      expect.any(Object),
    );
  });

  it('devolve 400 quando o corpo nao e JSON valido', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '<<<',
    });

    const res = await POST(req, { params });

    expect(res.status).toBe(400);
    expect(mockService.submitAnswer).not.toHaveBeenCalled();
  });

  it('devolve 400 quando itemId nao e uuid', async () => {
    const res = await POST(request({ itemId: 'nao-uuid', answer: {} }), { params });

    expect(res.status).toBe(400);
    expect(mockService.submitAnswer).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a tentativa nao e do aluno', async () => {
    mockService.submitAnswer.mockRejectedValue(
      new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404),
    );

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 409 quando a tentativa ja foi finalizada', async () => {
    mockService.submitAnswer.mockRejectedValue(
      new AppError('ATTEMPT_002', 'Tentativa ja finalizada.', 409),
    );

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(409);
  });

  it('devolve 422 quando o item nao pertence ao exercicio', async () => {
    mockService.submitAnswer.mockRejectedValue(
      new AppError('ATTEMPT_003', 'Item nao pertence a este exercicio.', 422),
    );

    const res = await POST(request({ itemId: ITEM_ID, answer: {} }), { params });

    expect(res.status).toBe(422);
  });

  // Aqui o gabarito PODE sair: o feedback imediato e o produto. O que nao pode
  // e ele viajar no envelope jogavel, antes de responder.
  it('devolve 200 com o gabarito e os contadores recontados', async () => {
    mockService.submitAnswer.mockResolvedValue({
      isCorrect: true,
      answerKey: { correctIndex: 0 },
      answeredCount: 1,
      correctCount: 1,
      itemCount: 4,
    });

    const res = await POST(
      request({ itemId: ITEM_ID, answer: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 } }),
      { params },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.answerKey).toEqual({ correctIndex: 0 });
    expect(body.data.answeredCount).toBe(1);
    expect(mockService.submitAnswer).toHaveBeenCalledWith(
      'ex-1',
      'at-1',
      'stu-1',
      expect.objectContaining({ itemId: ITEM_ID }),
    );
  });
});
