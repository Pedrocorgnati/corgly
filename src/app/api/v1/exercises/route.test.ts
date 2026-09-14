// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireStudent = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ listForStudent: vi.fn() }));

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

const STUDENT = { id: 'stu-1', role: 'STUDENT', tokenVersion: 1 };

function request(url = 'http://localhost/api/v1/exercises') {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(STUDENT);
});

describe('GET /api/v1/exercises', () => {
  it('devolve 401 sem autenticacao e nao acessa o service', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 401 }));

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(mockService.listForStudent).not.toHaveBeenCalled();
  });

  it('devolve 403 quando o guard recusa', async () => {
    mockRequireStudent.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await GET(request());

    expect(res.status).toBe(403);
    expect(mockService.listForStudent).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o filtro nao passa no schema', async () => {
    const res = await GET(request('http://localhost/api/v1/exercises?page=0'));

    expect(res.status).toBe(400);
    expect(mockService.listForStudent).not.toHaveBeenCalled();
  });

  it('escopa a consulta ao aluno logado', async () => {
    mockService.listForStudent.mockResolvedValue({ total: 0, page: 1, limit: 20, items: [] });

    await GET(request());

    expect(mockService.listForStudent).toHaveBeenCalledWith('stu-1', expect.any(Object));
  });

  it('devolve 200 sem gabarito no payload', async () => {
    mockService.listForStudent.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [{ id: 'ex-1', title: 'Presente', itemCount: 4 }],
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('answerKey');
  });
});
