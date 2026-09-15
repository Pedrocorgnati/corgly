// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error?: string | null, message?: string | null) => ({
    data,
    error: error ?? null,
    message: message ?? null,
  }),
}));
vi.mock('@/services/session.service', () => ({
  sessionService: { bulkCancelPreview: vi.fn(), bulkCancel: vi.fn() },
}));

import { sessionService } from '@/services/session.service';
import { GET, POST } from '@/app/api/v1/sessions/bulk-cancel/route';

const mockPreview = vi.mocked(sessionService.bulkCancelPreview);
const mockBulkCancel = vi.mocked(sessionService.bulkCancel);

function pedido(query: string, role: string | null = 'ADMIN'): NextRequest {
  return new NextRequest(`http://localhost/api/v1/sessions/bulk-cancel${query}`, {
    headers: role ? { 'x-user-role': role } : {},
  });
}

function pedidoPost(body: unknown, role: string | null = 'ADMIN'): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (role) headers['x-user-role'] = role;
  return new NextRequest('http://localhost/api/v1/sessions/bulk-cancel', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

// GAP-09: a rota nao muda nesta task. Os casos travam o guard, a validacao da
// previa e a serializacao do resultado do POST sem campo acrescentado.
describe('GET e POST /api/v1/sessions/bulk-cancel (GAP-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[REGRESSAO e1] deve recusar a previa com 403 para aluno e para pedido sem papel', async () => {
    for (const role of ['STUDENT', null]) {
      const res = await GET(pedido('?startDate=2026-04-01&endDate=2026-04-30', role));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Acesso restrito a administradores.');
    }
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('[REGRESSAO e2] deve devolver 400 quando a previa chega sem endDate', async () => {
    const res = await GET(pedido('?startDate=2026-04-01'));

    expect(res.status).toBe(400);
    const corpo = await res.json();
    expect(corpo.error).toBe('Dados inválidos.');
    expect(corpo.message).toBe('startDate e endDate são obrigatórios.');
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('[REGRESSAO e3] deve devolver 400 quando endDate vem antes de startDate na previa', async () => {
    const res = await GET(pedido('?startDate=2026-04-30&endDate=2026-04-01'));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('endDate deve ser maior ou igual a startDate.');
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('[REGRESSAO e4] deve devolver a previa do servico com 200 para admin', async () => {
    mockPreview.mockResolvedValue({ sessionsToCancel: 7, slotsToBlock: 12 });

    const res = await GET(pedido('?startDate=2026-04-01&endDate=2026-04-30'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { sessionsToCancel: 7, slotsToBlock: 12 }, error: null, message: null });
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith({ startDate: '2026-04-01', endDate: '2026-04-30' });
  });

  it('[REGRESSAO e5] deve recusar o POST com 403 para quem nao e admin', async () => {
    const res = await POST(pedidoPost({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' }, 'STUDENT'));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Acesso restrito a administradores.');
    expect(mockBulkCancel).not.toHaveBeenCalled();
  });

  it('[REGRESSAO e6] deve serializar o resultado do servico sem acrescentar nem remover campo', async () => {
    const resultado = { cancelled: 1, refunded: 1, blocked: 4, errors: [{ sessionId: 'sess-x', code: 'SESSION_080' }] };
    mockBulkCancel.mockResolvedValue(resultado);

    const res = await POST(pedidoPost({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: resultado, error: null, message: 'Aulas canceladas em lote.' }));
    expect(mockBulkCancel).toHaveBeenCalledTimes(1);
  });
});
