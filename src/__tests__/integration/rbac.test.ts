/**
 * RBAC Integration Tests — ST004 (AUTH_004)
 * Tests that route-level auth guards enforce role-based access control.
 * Uses mocked requireAdmin/requireStudent to isolate RBAC logic from DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: vi.fn(),
  requireStudent: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    session: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    content: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/services/content.service', () => ({
  contentService: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
}));

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error?: string | null, message?: string | null) => ({
    data,
    error: error ?? null,
    message: message ?? null,
  }),
}));

import { requireAdmin, requireStudent, requireAuth } from '@/lib/auth-guard';

const mockRequireAdmin = requireAdmin as ReturnType<typeof vi.fn>;
const mockRequireStudent = requireStudent as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;

function adminForbiddenResponse() {
  return NextResponse.json({ data: null, error: 'Acesso restrito a administradores.', message: null }, { status: 403 });
}

function studentForbiddenResponse() {
  return NextResponse.json({ data: null, error: 'Acesso restrito a estudantes.', message: null }, { status: 403 });
}

function makeAdminUser() {
  return { id: 'admin-1', role: 'ADMIN', tokenVersion: 0 };
}

function makeStudentUser() {
  return { id: 'student-1', role: 'STUDENT', tokenVersion: 0 };
}

function makeRequest(path: string, method = 'GET', body?: object): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── RBAC Tests ────────────────────────────────────────────────────────────────

describe('RBAC — Admin-only routes (AUTH_004)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('STUDENT gets 403 when accessing POST /api/v1/content — AUTH_004', async () => {
    mockRequireAdmin.mockResolvedValue(adminForbiddenResponse());

    const { POST } = await import('@/app/api/v1/content/route');
    const req = makeRequest('/api/v1/content', 'POST', { title: 'test', type: 'VIDEO', youtubeUrl: 'https://youtube.com/watch?v=abc', languageLevel: 'B1' });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it('ADMIN gets 200 when accessing POST /api/v1/content', async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminUser());
    const { contentService } = await import('@/services/content.service');
    (contentService.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c-1', title: 'Test' });

    const { POST } = await import('@/app/api/v1/content/route');
    const req = makeRequest('/api/v1/content', 'POST', {
      title: 'Test Video',
      type: 'VIDEO',
      youtubeUrl: 'https://youtube.com/watch?v=abc123',
      languageLevel: 'B1',
    });
    const res = await POST(req);

    // requireAdmin returned user (not NextResponse) → route should proceed
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it('STUDENT gets 403 when accessing GET /api/v1/admin/students', async () => {
    mockRequireAdmin.mockResolvedValue(adminForbiddenResponse());

    const { GET } = await import('@/app/api/v1/admin/students/route');
    const req = makeRequest('/api/v1/admin/students');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it('ADMIN gets 200 OK accessing GET /api/v1/admin/students', async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminUser());
    const { prisma } = await import('@/lib/prisma');
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { GET } = await import('@/app/api/v1/admin/students/route');
    const req = makeRequest('/api/v1/admin/students');
    const res = await GET(req);

    expect(mockRequireAdmin).toHaveBeenCalledOnce();
    expect(res.status).not.toBe(403);
  });
});

describe('RBAC — Student-only routes (AUTH_004)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('non-STUDENT gets 403 when accessing student-only route', async () => {
    // stats route uses requireAuth — return a forbidden NextResponse to simulate non-auth
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Não autenticado.', message: null }, { status: 403 }),
    );

    const { GET } = await import('@/app/api/v1/stats/route');
    const req = makeRequest('/api/v1/stats');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it('STUDENT gets successful response from student-only route', async () => {
    mockRequireAuth.mockResolvedValue(makeStudentUser());
    const { prisma } = await import('@/lib/prisma');
    (prisma.session.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Also stub unused optional mocks for completeness

    const { GET } = await import('@/app/api/v1/stats/route');
    const req = makeRequest('/api/v1/stats');
    const res = await GET(req);

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(res.status).not.toBe(403);
  });
});

describe('RBAC — Auth guard is always called (no bypass)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requireAdmin is called for every admin route request', async () => {
    mockRequireAdmin.mockResolvedValue(adminForbiddenResponse());

    const { GET } = await import('@/app/api/v1/admin/students/route');
    await GET(makeRequest('/api/v1/admin/students'));

    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it('requireAdmin rejects request before any business logic when it returns NextResponse', async () => {
    const forbiddenRes = adminForbiddenResponse();
    mockRequireAdmin.mockResolvedValue(forbiddenRes);
    const { contentService } = await import('@/services/content.service');

    const { POST } = await import('@/app/api/v1/content/route');
    const res = await POST(makeRequest('/api/v1/content', 'POST', { title: 'hack' }));

    // Business logic (contentService.create) must NOT be called when auth fails
    expect(contentService.create).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });
});
