// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringPattern: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error?: string) => ({ data, error: error ?? null }),
}));

const USER_ID = 'user-abc';

function makeRequest(body?: object, method = 'GET'): NextRequest {
  return new NextRequest('http://localhost/api/v1/recurring-patterns', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/recurring-patterns/${id}`, {
    method: 'DELETE',
  });
}

describe('GET /api/v1/recurring-patterns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista padrões ativos do usuário autenticado', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.findMany).mockResolvedValueOnce([
      { id: 'p1', studentId: USER_ID, dayOfWeek: 1, startTime: '09:00', isActive: true } as never,
    ]);

    const { GET } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe('p1');
  });

  it('retorna array vazio se nenhum padrão existe', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.findMany).mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it('retorna 401 sem autenticação', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAuth).mockResolvedValueOnce(
      NextResponse.json({ data: null, error: 'Não autorizado.' }, { status: 401 }),
    );

    const { GET } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/recurring-patterns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria padrão com dados válidos → 201', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.recurringPattern.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.recurringPattern.create).mockResolvedValueOnce({
      id: 'p2', studentId: USER_ID, dayOfWeek: 2, startTime: '10:00', isActive: true,
    } as never);

    const { POST } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await POST(makeRequest({ dayOfWeek: 2, startTime: '10:00' }, 'POST'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.dayOfWeek).toBe(2);
  });

  it('rejeita dayOfWeek inválido (> 6) → 400', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });

    const { POST } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await POST(makeRequest({ dayOfWeek: 7, startTime: '10:00' }, 'POST'));
    expect(res.status).toBe(400);
  });

  it('rejeita quando usuário já tem 3 padrões → 400', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.count).mockResolvedValueOnce(3);

    const { POST } = await import('@/app/api/v1/recurring-patterns/route');
    const res = await POST(makeRequest({ dayOfWeek: 3, startTime: '11:00' }, 'POST'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/recurring-patterns/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remove padrão próprio → { deleted: true }', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.findFirst).mockResolvedValueOnce({
      id: 'p1', studentId: USER_ID,
    } as never);
    vi.mocked(prisma.recurringPattern.update).mockResolvedValueOnce({} as never);

    const { DELETE } = await import('@/app/api/v1/recurring-patterns/[id]/route');
    const res = await DELETE(makeDeleteRequest('p1'), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.deleted).toBe(true);
  });

  it('rejeita padrão de outro usuário (IDOR) → 404', async () => {
    const { requireAuth } = await import('@/lib/auth-guard');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: USER_ID, role: 'STUDENT', tokenVersion: 0 });
    vi.mocked(prisma.recurringPattern.findFirst).mockResolvedValueOnce(null);

    const { DELETE } = await import('@/app/api/v1/recurring-patterns/[id]/route');
    const res = await DELETE(makeDeleteRequest('p-other'), { params: Promise.resolve({ id: 'p-other' }) });
    expect(res.status).toBe(404);
  });
});
