// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => ({ maxRequests: 60, windowMs: 60_000 }));
const mockService = vi.hoisted(() => ({ checkMatchPair: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireStudent: mockRequireStudent }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: { EXERCISE_ANSWER_SUBMIT: mockRateLimit },
}));
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { API } from '@/lib/constants/routes';
import { AppError } from '@/lib/errors';
import { POST } from './route';

const STUDENT = { id: 'student-1', role: 'STUDENT', tokenVersion: 1 };
const EXERCISE_ID = 'exercise-1';
const ATTEMPT_ID = 'attempt-1';
const ITEM_ID = 'item-1';
const params = Promise.resolve({
  id: EXERCISE_ID,
  attemptId: ATTEMPT_ID,
  itemId: ITEM_ID,
});
const URL = `http://localhost${API.EXERCISES.ATTEMPT_MATCH_CHECK(
  EXERCISE_ID,
  ATTEMPT_ID,
  ITEM_ID,
)}`;

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
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  });
});

describe('POST /api/v1/exercises/[id]/attempts/[attemptId]/items/[itemId]/match-check', () => {
  it('expoe o caminho canonico no namespace de exercicios', () => {
    expect(API.EXERCISES.ATTEMPT_MATCH_CHECK(EXERCISE_ID, ATTEMPT_ID, ITEM_ID)).toBe(
      '/api/v1/exercises/exercise-1/attempts/attempt-1/items/item-1/match-check',
    );
  });

  it('devolve 401 antes do limiter e do service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const response = await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockService.checkMatchPair).not.toHaveBeenCalled();
  });

  it('devolve 403 antes do limiter e do service quando o papel e recusado', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const response = await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });

    expect(response.status).toBe(403);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockService.checkMatchPair).not.toHaveBeenCalled();
  });

  it('compartilha a chave por aluno e o limite da rota de respostas', async () => {
    mockService.checkMatchPair.mockResolvedValue({ isCorrect: true });

    await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'exercise-answer:student-1',
      mockRateLimit,
    );
  });

  it('devolve 429 com Retry-After e nao chama o service', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const response = await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mockService.checkMatchPair).not.toHaveBeenCalled();
  });

  it('devolve 400 para JSON invalido sem chamar o service', async () => {
    const invalidRequest = new NextRequest(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '<<<',
    });

    const response = await POST(invalidRequest, { params });

    expect(response.status).toBe(400);
    expect(mockService.checkMatchPair).not.toHaveBeenCalled();
  });

  it.each([
    ['campo ausente', { leftId: 'left-1' }],
    ['id vazio', { leftId: '', rightId: 'right-1' }],
    ['campo extra', { leftId: 'left-1', rightId: 'right-1', answerKey: {} }],
  ])('devolve 400 para body invalido: %s', async (_label, body) => {
    const response = await POST(request(body), { params });

    expect(response.status).toBe(400);
    expect(mockService.checkMatchPair).not.toHaveBeenCalled();
  });

  it.each([
    ['recurso ou tentativa nao encontrado', new AppError('ATTEMPT_001', 'Tentativa nao encontrada.', 404), 404],
    ['tentativa fora de IN_PROGRESS', new AppError('ATTEMPT_002', 'Tentativa nao esta em andamento.', 409), 409],
    [
      'item incompatível, fora do exercício ou ids inexistentes',
      new AppError('ATTEMPT_003', 'Par incompativel com o item.', 422, {
        answerKey: { pairs: [{ leftId: 'left-1', rightId: 'right-2' }] },
      }),
      422,
    ],
  ])('preserva AppError para %s', async (_label, error, status) => {
    mockService.checkMatchPair.mockRejectedValue(error);

    const response = await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body.data).toBeNull();
    expect(JSON.stringify(body)).not.toContain('answerKey');
    expect(JSON.stringify(body)).not.toContain('right-2');
  });

  it('devolve somente isCorrect e encaminha ids normalizados ao service', async () => {
    mockService.checkMatchPair.mockResolvedValue({
      isCorrect: false,
      answerKey: { pairs: [{ leftId: 'left-1', rightId: 'right-2' }] },
      correctPair: { leftId: 'left-1', rightId: 'right-2' },
      answeredCount: 3,
      correctCount: 2,
    });

    const response = await POST(
      request({ leftId: '  left-1  ', rightId: '  right-1  ' }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ isCorrect: false });
    expect(Object.keys(body.data)).toEqual(['isCorrect']);
    expect(JSON.stringify(body)).not.toContain('answerKey');
    expect(JSON.stringify(body)).not.toContain('correctPair');
    expect(JSON.stringify(body)).not.toContain('answeredCount');
    expect(JSON.stringify(body)).not.toContain('correctCount');
    expect(mockService.checkMatchPair).toHaveBeenCalledOnce();
    expect(mockService.checkMatchPair).toHaveBeenCalledWith(
      {
        exerciseId: EXERCISE_ID,
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        leftId: 'left-1',
        rightId: 'right-1',
      },
      'student-1',
    );
  });

  it('sanitiza erro inesperado no wrapper', async () => {
    mockService.checkMatchPair.mockRejectedValue(new Error('gabarito interno sensivel'));

    const response = await POST(request({ leftId: 'left-1', rightId: 'right-1' }), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body.error).toBe('Erro interno. Tente novamente em instantes.');
    expect(JSON.stringify(body)).not.toContain('gabarito interno sensivel');
  });
});
