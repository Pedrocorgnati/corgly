// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ listForAdmin: vi.fn(), create: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
// `importOriginal` preserva o `statusForAppError` REAL: o que esta sob teste
// aqui e justamente a traducao de AppError em status HTTP.
vi.mock('@/services/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/exercise.service')>()),
  exerciseService: mockService,
}));

import { GET, POST } from './route';
import { AppError } from '@/lib/errors';

const ADMIN = { id: 'admin-1', role: 'ADMIN', tokenVersion: 1 };

function getRequest(url = 'http://localhost/api/v1/admin/exercises') {
  return new NextRequest(url, { method: 'GET' });
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/admin/exercises', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  internalTitle: 'Presente do indicativo',
  supportLanguage: 'PT_BR',
  level: 1,
  translations: [{ locale: 'PT_BR', title: 'Presente' }],
  items: [
    {
      kind: 'MULTIPLE_CHOICE',
      position: 1,
      payload: { prompt: 'Eu ___ italiano.', options: ['falo', 'fala', 'falam', 'falamos'] },
      answerKey: { correctIndex: 0 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('GET /api/v1/admin/exercises', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Acesso restrito a administradores.', message: null }, { status: 403 }),
    );

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    expect(mockService.listForAdmin).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o filtro nao passa no schema', async () => {
    const res = await GET(getRequest('http://localhost/api/v1/admin/exercises?limit=999'));

    expect(res.status).toBe(400);
    expect(mockService.listForAdmin).not.toHaveBeenCalled();
  });

  it('devolve 200 com o resultado do service', async () => {
    mockService.listForAdmin.mockResolvedValue({ total: 0, page: 1, limit: 20, items: [] });

    const res = await GET(getRequest('http://localhost/api/v1/admin/exercises?page=2&limit=5'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(mockService.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 }),
    );
  });
});

describe('POST /api/v1/admin/exercises', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Acesso restrito a administradores.', message: null }, { status: 403 }),
    );

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(403);
  });

  it('devolve 400 quando o corpo nao e JSON valido', async () => {
    const req = new NextRequest('http://localhost/api/v1/admin/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ nao e json',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o schema recusa o payload', async () => {
    const res = await POST(postRequest({ ...VALID_BODY, internalTitle: '' }));

    expect(res.status).toBe(400);
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('devolve 422 quando o service recusa por regra de dominio', async () => {
    mockService.create.mockRejectedValue(
      new AppError('EXERCISE_002', 'Idioma de apoio IT_IT nao e publicado.', 422),
    );

    const res = await POST(postRequest({ ...VALID_BODY, supportLanguage: 'IT_IT' }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain('IT_IT');
    expect(body.data).toBeNull();
  });

  it('devolve 201 no caminho feliz', async () => {
    mockService.create.mockResolvedValue({ id: 'ex-1', status: 'DRAFT' });

    const res = await POST(postRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('ex-1');
    expect(mockService.create).toHaveBeenCalledWith(expect.any(Object), 'admin-1');
  });
});
