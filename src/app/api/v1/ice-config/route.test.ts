// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetIceServers = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/iceServers', () => ({ getIceServers: mockGetIceServers }));
vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { GENERAL: { maxRequests: 60, windowMs: 60_000 } },
  checkRateLimit: mockCheckRateLimit,
}));

import { GET } from './route';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/v1/ice-config', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/v1/ice-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockGetIceServers.mockReturnValue([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('gera ICE servers no servidor usando o usuario autenticado', async () => {
    const res = await GET(request({ 'x-user-id': 'user-1', 'x-forwarded-for': '127.0.0.1' }), {});

    expect(res.status).toBe(200);
    expect(mockGetIceServers).toHaveBeenCalledWith('user-1');

    const body = await res.json();
    expect(body.data.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('limita abuso por identidade efetiva', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const res = await GET(request({ 'x-forwarded-for': '127.0.0.1' }), {});

    expect(res.status).toBe(429);
    expect(mockGetIceServers).not.toHaveBeenCalled();
  });
});
