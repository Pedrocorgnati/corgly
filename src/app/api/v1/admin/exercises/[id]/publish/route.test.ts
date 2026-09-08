// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { POST } from './route';
import { AppError } from '@/lib/errors';

const ADMIN = { id: 'admin-1', role: 'ADMIN', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1' });

function request() {
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1/publish', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('POST /api/v1/admin/exercises/[id]/publish', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await POST(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.publish).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o exercicio nao existe', async () => {
    mockService.publish.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 409 quando a transicao de status e impossivel', async () => {
    mockService.publish.mockRejectedValue(
      new AppError('EXERCISE_007', 'Transicao de status impossivel.', 409),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
  });

  it('devolve 422 quando uma pre-condicao de conteudo falha', async () => {
    mockService.publish.mockRejectedValue(
      new AppError('EXERCISE_003', 'Exercicio sem itens.', 422),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(422);
  });

  it('devolve 200 no caminho feliz', async () => {
    mockService.publish.mockResolvedValue({ id: 'ex-1' });

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('ex-1');
    expect(mockService.publish).toHaveBeenCalledWith('ex-1', 'admin-1');
  });
});
