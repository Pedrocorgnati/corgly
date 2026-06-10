// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const SECRET = 'test-hocuspocus-secret-with-32+-characters-xx';

// `@/lib/env` valida TODAS as env vars no import (e a route importa apiResponse
// de @/lib/auth, que importa env). Semeamos process.env antes de qualquer import
// de módulo (vi.hoisted roda antes das imports estáticas) para o safeParse passar.
vi.hoisted(() => {
  const SECRET32 = 'test-hocuspocus-secret-with-32+-characters-xx';
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    JWT_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    CRON_SECRET: 'x'.repeat(16),
    HOCUSPOCUS_JWT_SECRET: SECRET32,
    ENCRYPTION_KEY: 'x'.repeat(32),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    RESEND_API_KEY: 're_test_fake',
    EMAIL_FROM: 'noreply@corgly.test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
  });
});

// Mock prisma — usado por requireAuth (user.findUnique) e pelo service (session.findUnique).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

const mockPrisma = vi.mocked(prisma, true);

function buildRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/sessions/session-1/notes/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
}

function authHeaders(userId: string, role: 'STUDENT' | 'ADMIN', tokenVersion = 0) {
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-token-version': String(tokenVersion),
  };
}

const params = Promise.resolve({ id: 'session-1' });

describe('POST /api/v1/sessions/:id/notes/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('HOCUSPOCUS_JWT_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('401 quando não autenticado (sem headers do middleware)', async () => {
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('404 quando a sessão não existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      tokenVersion: 0,
    } as never);
    mockPrisma.session.findUnique.mockResolvedValue(null as never);

    const res = await POST(buildRequest(authHeaders('student-1', 'STUDENT')), { params });
    expect(res.status).toBe(404);
  });

  it('403 quando não é participante da sessão', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'outro-aluno',
      role: 'STUDENT',
      tokenVersion: 0,
    } as never);
    mockPrisma.session.findUnique.mockResolvedValue({
      studentId: 'student-1',
      status: 'IN_PROGRESS',
    } as never);

    const res = await POST(buildRequest(authHeaders('outro-aluno', 'STUDENT')), { params });
    expect(res.status).toBe(403);
  });

  it('200 e emite { token } verificável para o participante autorizado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      tokenVersion: 0,
    } as never);
    mockPrisma.session.findUnique.mockResolvedValue({
      studentId: 'student-1',
      status: 'SCHEDULED',
    } as never);

    const res = await POST(buildRequest(authHeaders('student-1', 'STUDENT')), { params });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { token: string } | null };
    expect(body.data?.token).toBeTruthy();

    const decoded = jwt.verify(body.data!.token, SECRET) as {
      userId: string;
      sessionId: string;
      role: string;
    };
    expect(decoded).toMatchObject({
      userId: 'student-1',
      sessionId: 'session-1',
      role: 'STUDENT',
    });
  });

  it('500 quando a assinatura falha (HOCUSPOCUS_JWT_SECRET inválido)', async () => {
    vi.stubEnv('HOCUSPOCUS_JWT_SECRET', 'curto');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      tokenVersion: 0,
    } as never);
    mockPrisma.session.findUnique.mockResolvedValue({
      studentId: 'student-1',
      status: 'IN_PROGRESS',
    } as never);

    const res = await POST(buildRequest(authHeaders('student-1', 'STUDENT')), { params });
    expect(res.status).toBe(500);
  });
});
