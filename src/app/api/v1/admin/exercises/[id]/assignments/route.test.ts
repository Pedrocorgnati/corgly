// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ listAssignments: vi.fn(), grant: vi.fn() }));

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

import { GET, POST } from './route';
import { AppError } from '@/lib/errors';

const ADMIN = { id: 'admin-1', role: 'ADMIN', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1' });
const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

function getRequest() {
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1/assignments', {
    method: 'GET',
  });
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/admin/exercises/ex-1/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('GET /api/v1/admin/exercises/[id]/assignments', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await GET(getRequest(), { params });

    expect(res.status).toBe(403);
  });

  it('devolve 404 quando o exercicio nao existe', async () => {
    mockService.listAssignments.mockRejectedValue(
      new AppError('EXERCISE_001', 'Exercicio nao encontrado.', 404),
    );

    const res = await GET(getRequest(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 200 com a lista de liberacoes', async () => {
    mockService.listAssignments.mockResolvedValue([{ id: 'as-1', status: 'ACTIVE' }]);

    const res = await GET(getRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/admin/exercises/[id]/assignments', () => {
  it('devolve 400 quando o corpo nao e JSON valido', async () => {
    const req = new NextRequest('http://localhost/api/v1/admin/exercises/ex-1/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'nope',
    });

    const res = await POST(req, { params });

    expect(res.status).toBe(400);
    expect(mockService.grant).not.toHaveBeenCalled();
  });

  it('devolve 400 quando studentIds vem vazio', async () => {
    const res = await POST(postRequest({ studentIds: [] }), { params });

    expect(res.status).toBe(400);
    expect(mockService.grant).not.toHaveBeenCalled();
  });

  it('devolve 409 quando o exercicio nao esta publicado', async () => {
    mockService.grant.mockRejectedValue(
      new AppError('ASSIGNMENT_002', 'So exercicio publicado pode ser liberado.', 409),
    );

    const res = await POST(postRequest({ studentIds: [STUDENT_ID] }), { params });

    expect(res.status).toBe(409);
  });

  // Esta e a UNICA rota do dominio em que `data` carrega conteudo no erro: sem a
  // lista de reprovados o admin so descobriria o id errado testando um por um.
  it('devolve 422 com os ids reprovados em data', async () => {
    mockService.grant.mockRejectedValue(
      new AppError('ASSIGNMENT_004', 'Selecao contem alunos invalidos.', 422, {
        rejected: [{ studentId: STUDENT_ID, reason: 'NOT_STUDENT' }],
      }),
    );

    const res = await POST(postRequest({ studentIds: [STUDENT_ID] }), { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.data.rejected).toEqual([{ studentId: STUDENT_ID, reason: 'NOT_STUDENT' }]);
    expect(body.error).toContain('invalidos');
  });

  it('devolve 201 no caminho feliz', async () => {
    mockService.grant.mockResolvedValue([{ id: 'as-1', studentId: STUDENT_ID }]);

    const res = await POST(postRequest({ studentIds: [STUDENT_ID] }), { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toHaveLength(1);
    expect(mockService.grant).toHaveBeenCalledWith('ex-1', [STUDENT_ID], 'admin-1');
  });
});
