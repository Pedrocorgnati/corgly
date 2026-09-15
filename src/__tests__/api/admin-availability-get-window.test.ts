// @vitest-environment node
/**
 * GAP-08 - `GET /api/v1/admin/availability` rejeita data civil impossivel com 400.
 *
 * Gemeo de `availability-get-window.test.ts` contra `listForAdmin`: a rota admin
 * copiava a mesma validacao so de formato da rota publica. Guard, ordem, teto e
 * o `catch` do GET ficam iguais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/services/availability.service', () => ({
  availabilityService: { getAvailable: vi.fn(), listForAdmin: vi.fn(), generateSlots: vi.fn() },
}));
vi.mock('@/lib/canonical-timezone', () => ({
  getCanonicalTimezone: vi.fn(async () => 'America/Sao_Paulo'),
}));

import { requireAdmin } from '@/lib/auth-guard';
import { availabilityService } from '@/services/availability.service';
import { GET } from '@/app/api/v1/admin/availability/route';

const MSG_DATE = 'Parâmetro date inválido. Use formato YYYY-MM-DD.';
const MSG_UNTIL = 'Parâmetro until inválido. Use formato YYYY-MM-DD.';
const MSG_ORDEM = 'Parâmetro until deve ser posterior a date.';
const MSG_TETO = 'Janela solicitada excede o horizonte máximo de 84 dias.';

const mockRequireAdmin = vi.mocked(requireAdmin);
const listForAdmin = vi.mocked(availabilityService.listForAdmin);

function pedir(query: string) {
  return GET(new NextRequest(`http://localhost/api/v1/admin/availability?${query}`));
}

async function erroDe(res: Response): Promise<unknown> {
  const corpo = (await res.json()) as { error: unknown };
  return corpo.error;
}

describe('GET /api/v1/admin/availability - data civil valida (GAP-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      tokenVersion: 0,
    } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
    listForAdmin.mockResolvedValue([]);
  });

  it('REGRESSAO: K1 janela valida chega ao servico com date e until exclusivo', async () => {
    const res = await pedir('date=2026-09-01&until=2026-10-02');
    expect(res.status).toBe(200);
    expect(listForAdmin.mock.calls[0][0]).toBe('2026-09-01');
    expect(listForAdmin.mock.calls[0][1]).toBe('2026-10-02');
  });

  it('REGRESSAO: K2 until igual ou anterior a date responde 400', async () => {
    for (const query of ['date=2026-09-01&until=2026-09-01', 'date=2026-09-02&until=2026-09-01']) {
      const res = await pedir(query);
      expect(res.status).toBe(400);
      expect(await erroDe(res)).toBe(MSG_ORDEM);
    }
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it('REGRESSAO: K3 teto de 84 dias', async () => {
    const acima = await pedir('date=2026-09-01&until=2026-11-25');
    expect(acima.status).toBe(400);
    expect(await erroDe(acima)).toBe(MSG_TETO);

    const noTeto = await pedir('date=2026-09-01&until=2026-11-24');
    expect(noTeto.status).toBe(200);
    expect(listForAdmin).toHaveBeenCalledTimes(1);
  });

  it('RED: K4 date 2026-02-30 responde 400 sem chamar o servico', async () => {
    const res = await pedir('date=2026-02-30&until=2026-03-10');
    expect(res.status).toBe(400);
    expect(await erroDe(res)).toBe(MSG_DATE);
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it('RED: K5 date 2026-13-01 sem until responde 400 em vez de rejeitar', async () => {
    const promessa = pedir('date=2026-13-01');
    await expect(promessa).resolves.toBeInstanceOf(NextResponse);
    const res = await promessa;
    expect(res.status).toBe(400);
    expect(await erroDe(res)).toBe(MSG_DATE);
  });

  it('RED: K6 until 2026-04-31 responde 400 sem chamar o servico', async () => {
    const res = await pedir('date=2026-04-01&until=2026-04-31');
    expect(res.status).toBe(400);
    expect(await erroDe(res)).toBe(MSG_UNTIL);
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it('RED: K7 until 2026-13-10 responde 400 sem chamar o servico', async () => {
    const res = await pedir('date=2026-01-01&until=2026-13-10');
    expect(res.status).toBe(400);
    expect(await erroDe(res)).toBe(MSG_UNTIL);
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it('CONTROLE: K8 sem date responde 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/v1/admin/availability'));
    expect(res.status).toBe(400);
    expect(await erroDe(res)).toBe(MSG_DATE);
  });

  it('CONTROLE: K9 falha do servico vira 500 sem rejeitar', async () => {
    listForAdmin.mockRejectedValueOnce(new Error('falha simulada'));
    const promessa = pedir('date=2026-09-01&until=2026-10-02');
    await expect(promessa).resolves.toBeInstanceOf(NextResponse);
    const res = await promessa;
    expect(res.status).toBe(500);
    expect(await erroDe(res)).toBe('Erro interno.');
    expect(listForAdmin).toHaveBeenCalledTimes(1);
  });
});
