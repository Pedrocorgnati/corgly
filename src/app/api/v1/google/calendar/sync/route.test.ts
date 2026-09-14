/**
 * Testes unitarios para a rota /api/v1/google/calendar/sync.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { requireAdmin } from '@/lib/auth-guard';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';
import { AppError } from '@/lib/errors';

// Mocks
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/services/google-calendar-push.service', () => ({
  googleCalendarPushService: {
    incrementalSync: vi.fn(),
  },
}));

const mockRequest = () => new NextRequest(new URL('http://localhost/api/v1/google/calendar/sync'));

describe('POST /api/v1/google/calendar/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executa sincronizacao com admin autenticado', async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 });
    (googleCalendarPushService.incrementalSync as ReturnType<typeof vi.fn>).mockResolvedValue({
      eventosProcessados: 3,
      bloqueados: ['slot-1', 'slot-2'],
      liberados: ['slot-3'],
      conflitos: [],
    });

    const response = await POST(mockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.resumo.eventosProcessados).toBe(3);
    expect(data.resumo.slotsBloqueados).toBe(2);
    expect(data.resumo.slotsLiberados).toBe(1);
    expect(googleCalendarPushService.incrementalSync).toHaveBeenCalledWith('admin-1');
  });

  it('retorna 403 para student', async () => {
    // requireAdmin retorna NextResponse em caso de erro
    const forbiddenResponse = NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(forbiddenResponse);

    const response = await POST(mockRequest());

    expect(response.status).toBe(403);
  });

  it('retorna 401 para usuario nao autenticado', async () => {
    const unauthorizedResponse = NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(unauthorizedResponse);

    const response = await POST(mockRequest());

    expect(response.status).toBe(401);
  });

  it('retorna erro da sincronizacao quando credencial nao existe', async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 });
    (googleCalendarPushService.incrementalSync as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AppError('GOOGLE_CREDENTIAL_NOT_FOUND', 'Credencial nao encontrada.', 404)
    );

    const response = await POST(mockRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('GOOGLE_CREDENTIAL_NOT_FOUND');
  });
});
