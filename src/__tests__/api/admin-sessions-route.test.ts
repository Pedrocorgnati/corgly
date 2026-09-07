/**
 * FX-12C — `GET /api/v1/admin/sessions`.
 *
 * A rota é o único consumidor de `sessionService.listAllForAdmin` e a única que
 * entende o filtro `hasFeedback`. O que estes testes travam:
 *
 *  - `hasFeedback` chega ao serviço como ternário de verdade (ausente / true /
 *    false). Antes, QUALQUER texto diferente de "true" — inclusive `1` ou um
 *    typo — virava `false` e a tela escondia metade das aulas sem avisar;
 *  - `page`/`limit` fora de contrato (`abc`, `-3`, `0`, `9999`) não viram
 *    `skip`/`take` inválidos no Prisma (500 mudo, tela "nenhuma sessão");
 *  - a rota chama a listagem ADMIN, não a genérica.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth-guard', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error?: string | null, message?: string | null) => ({
    data,
    error: error ?? null,
    message: message ?? null,
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/session.service', () => ({
  sessionService: { listAllForAdmin: vi.fn(), listAll: vi.fn() },
}));

import { requireAdmin } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';
import { sessionService } from '@/services/session.service';
import { GET } from '@/app/api/v1/admin/sessions/route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockListAllForAdmin = vi.mocked(sessionService.listAllForAdmin);
const mockListAll = vi.mocked(sessionService.listAll);

const PAGINA_VAZIA = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };

function pedido(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/sessions${query}`);
}

describe('GET /api/v1/admin/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      tokenVersion: 0,
    } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
    mockListAllForAdmin.mockResolvedValue(PAGINA_VAZIA);
  });

  it('usa a listagem ADMIN, não a genérica', async () => {
    await GET(pedido(''));

    expect(mockListAllForAdmin).toHaveBeenCalledTimes(1);
    expect(mockListAll).not.toHaveBeenCalled();
  });

  it('devolve 403/401 do guard sem consultar nada', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Acesso restrito a administradores.' }, { status: 403 }),
    );

    const res = await GET(pedido(''));

    expect(res.status).toBe(403);
    expect(mockListAllForAdmin).not.toHaveBeenCalled();
  });

  it('hasFeedback=true chega ao serviço como true', async () => {
    await GET(pedido('?hasFeedback=true'));

    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ hasFeedback: true }),
    );
  });

  it('hasFeedback=false chega ao serviço como false', async () => {
    await GET(pedido('?hasFeedback=false'));

    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ hasFeedback: false }),
    );
  });

  it('sem hasFeedback o filtro fica indefinido (lista tudo)', async () => {
    await GET(pedido(''));

    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ hasFeedback: undefined }),
    );
  });

  it('hasFeedback fora do vocabulário responde 400 dizendo o que aceita', async () => {
    const res = await GET(pedido('?hasFeedback=1'));

    expect(res.status).toBe(400);
    const corpo = await res.json();
    expect(corpo.error).toBe('Filtro de feedback inválido.');
    expect(corpo.message).toContain('true');
    expect(mockListAllForAdmin).not.toHaveBeenCalled();
  });

  it('status conhecido vira filtro; desconhecido é ignorado', async () => {
    await GET(pedido('?status=COMPLETED'));
    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED' }),
    );

    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
    mockListAllForAdmin.mockResolvedValue(PAGINA_VAZIA);

    await GET(pedido('?status=INVENTADO'));
    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it.each([
    ['?page=abc', 1],
    ['?page=-3', 1],
    ['?page=0', 1],
    ['?page=2.9', 2],
    ['?page=4', 4],
  ])('page %s vira %i', async (query, esperado) => {
    await GET(pedido(query));

    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: esperado }),
    );
  });

  it.each([
    ['?limit=abc', 20],
    ['?limit=0', 1],
    ['?limit=9999', 100],
    ['?limit=50', 50],
  ])('limit %s vira %i', async (query, esperado) => {
    await GET(pedido(query));

    expect(mockListAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ limit: esperado }),
    );
  });

  it('falha do serviço vira 500 COM log (não some em silêncio)', async () => {
    mockListAllForAdmin.mockRejectedValue(new Error('prisma caiu'));

    const res = await GET(pedido(''));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      'GET /api/v1/admin/sessions',
      expect.objectContaining({ action: 'admin.sessions.list' }),
      expect.any(Error),
    );
  });
});
