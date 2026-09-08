// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockService = vi.hoisted(() => ({ revoke: vi.fn() }));

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

import { DELETE } from './route';
import { AppError } from '@/lib/errors';

const ADMIN = { id: 'admin-1', role: 'ADMIN', tokenVersion: 1 };
const params = Promise.resolve({ id: 'ex-1', assignmentId: 'as-1' });

function request() {
  return new NextRequest(
    'http://localhost/api/v1/admin/exercises/ex-1/assignments/as-1',
    { method: 'DELETE' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('DELETE /api/v1/admin/exercises/[id]/assignments/[assignmentId]', () => {
  it('devolve 403 quando o guard recusa', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    const res = await DELETE(request(), { params });

    expect(res.status).toBe(403);
    expect(mockService.revoke).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a liberacao nao existe ou e de outro exercicio', async () => {
    mockService.revoke.mockRejectedValue(
      new AppError('ASSIGNMENT_001', 'Liberacao nao encontrada.', 404),
    );

    const res = await DELETE(request(), { params });

    expect(res.status).toBe(404);
  });

  it('devolve 200 no caminho feliz', async () => {
    mockService.revoke.mockResolvedValue({ id: 'as-1', status: 'REVOKED' });

    const res = await DELETE(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('REVOKED');
    expect(mockService.revoke).toHaveBeenCalledWith('ex-1', 'as-1', 'admin-1');
  });
});
