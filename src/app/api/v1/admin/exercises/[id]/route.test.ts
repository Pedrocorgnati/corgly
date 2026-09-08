// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ getForAdmin: vi.fn(), update: vi.fn() }));

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

import { GET, PATCH } from './route';
import { AppError } from '@/lib/errors';

const ADMIN = { id: 'admin-1', role: 'ADMIN', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1' });

function getRequest() {
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1', { method: 'GET' });
}

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('GET /api/v1/admin/exercises/[id]', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await GET(getRequest(), { params });

    expect(res.status).toBe(403);
    expect(mockService.getForAdmin).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o exercicio nao existe', async () => {
    mockService.getForAdmin.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await GET(getRequest(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 200 com o detalhe do admin, gabarito incluso', async () => {
    mockService.getForAdmin.mockResolvedValue({
      id: 'ex-1',
      items: [{ id: 'it-1', answerKey: { correctIndex: 0 } }],
    });

    const res = await GET(getRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items[0].answerKey).toEqual({ correctIndex: 0 });
  });
});

describe('PATCH /api/v1/admin/exercises/[id]', () => {
  it('devolve 400 quando o corpo nao e JSON valido', async () => {
    const req = new NextRequest('http://localhost/api/v1/admin/exercises/ex-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{{',
    });

    const res = await PATCH(req, { params });

    expect(res.status).toBe(400);
    expect(mockService.update).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o schema recusa o campo', async () => {
    const res = await PATCH(patchRequest({ level: 'muito alto' }), { params });

    expect(res.status).toBe(400);
    expect(mockService.update).not.toHaveBeenCalled();
  });

  it('devolve 422 quando o service recusa item de outro exercicio', async () => {
    mockService.update.mockRejectedValue(
      new AppError('EXERCISE_004', 'Item it-9 nao pertence a este exercicio.', 422),
    );

    const res = await PATCH(patchRequest({ internalTitle: 'Novo titulo' }), { params });

    expect(res.status).toBe(422);
  });

  it('devolve 200 no caminho feliz', async () => {
    mockService.update.mockResolvedValue({ id: 'ex-1', internalTitle: 'Novo titulo' });

    const res = await PATCH(patchRequest({ internalTitle: 'Novo titulo' }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.internalTitle).toBe('Novo titulo');
    expect(mockService.update).toHaveBeenCalledWith('ex-1', expect.any(Object), 'admin-1');
  });
});
