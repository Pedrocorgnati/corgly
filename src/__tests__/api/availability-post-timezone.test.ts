// @vitest-environment node
/**
 * GAP-07 (item 018) - `POST /api/v1/availability` sem `timezone`.
 *
 * Com `.default('America/Sao_Paulo')` no `GenerateSlotsSchema`, a rota
 * carimbava Sao Paulo em todo pedido sem fuso e o `timezone ??
 * getCanonicalTimezone()` de `generateSlots` nunca chegava a ler app_settings.
 * O que estes testes travam: fuso ausente chega AUSENTE ao servico, fuso
 * explicito continua passando e a validacao de `days` segue igual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

const mocks = vi.hoisted(() => ({
  generateSlots: vi.fn(),
}));

vi.mock('@/services/availability.service', () => ({
  availabilityService: { generateSlots: mocks.generateSlots },
}));

import { requireAdmin } from '@/lib/auth-guard';
import { GenerateSlotsSchema } from '@/schemas/availability.schema';
import { POST } from '@/app/api/v1/availability/route';

const mockRequireAdmin = vi.mocked(requireAdmin);

const CORPO = { days: [2], ranges: [{ start: '09:00', end: '10:00' }], weeksAhead: 1 };

function pedido(corpo: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/availability', {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/v1/availability - timezone ausente (GAP-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      tokenVersion: 0,
    } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
    // Hipotese de forma: o teste so le a chamada, nunca o retorno.
    mocks.generateSlots.mockResolvedValue({ created: 1, skipped: [] });
  });

  it('RED 018 [ST006]: schema sem timezone deixa timezone indefinido', () => {
    const parsed = GenerateSlotsSchema.safeParse(CORPO);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.timezone).toBeUndefined();
  });

  it('RED 018 [ST006]: POST sem timezone repassa timezone indefinido', async () => {
    const res = await POST(pedido(CORPO));
    expect(res.status).toBe(201);
    expect(mocks.generateSlots).toHaveBeenCalledTimes(1);
    expect(mocks.generateSlots.mock.calls[0][0].timezone).toBeUndefined();
  });

  it('CONTROLE: POST com Asia/Tokyo repassa o fuso explicito', async () => {
    const res = await POST(pedido({ ...CORPO, timezone: 'Asia/Tokyo' }));
    expect(res.status).toBe(201);
    expect(mocks.generateSlots).toHaveBeenCalledTimes(1);
    expect(mocks.generateSlots.mock.calls[0][0].timezone).toBe('Asia/Tokyo');
  });

  it('CONTROLE: days vazio responde 400', async () => {
    const res = await POST(pedido({ ...CORPO, days: [] }));
    expect(res.status).toBe(400);
    expect(mocks.generateSlots).not.toHaveBeenCalled();
  });
});
