// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ archive: vi.fn() }));

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
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1/archive', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('POST /api/v1/admin/exercises/[id]/archive', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await POST(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.archive).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o exercicio nao existe', async () => {
    mockService.archive.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(404);
  });

  // Arquivar so tem duas saidas de erro de dominio: 404 e 409. Nao ha
  // pre-condicao de conteudo, entao nao ha 422 nesta rota.
  it('devolve 409 quando ja esta arquivado', async () => {
    mockService.archive.mockRejectedValue(
      new AppError('EXERCISE_007', 'Exercicio ja esta arquivado.', 409),
    );

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
  });

  it('devolve 200 no caminho feliz', async () => {
    mockService.archive.mockResolvedValue({ id: 'ex-1' });

    const res = await POST(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('ex-1');
    expect(mockService.archive).toHaveBeenCalledWith('ex-1', 'admin-1');
  });
});
