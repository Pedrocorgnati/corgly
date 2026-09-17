// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

const mocks = vi.hoisted(() => ({ reconcile: vi.fn() }));

vi.mock('@/services/cron.service', () => ({
  cronService: { runGoogleCalendarReconciliation: mocks.reconcile },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function request(token?: string) {
  return new NextRequest('http://localhost/api/v1/cron/google-calendar-reconciliation', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe('GET /api/v1/cron/google-calendar-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-test';
    mocks.reconcile.mockResolvedValue({ reconciled: 1, alarms: ['alarme-a', 'alarme-b'] });
  });

  it('retorna 401 sem segredo valido e nao executa o job', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('retorna 401 quando CRON_SECRET nao esta configurado', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request('undefined'))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('executa o job e devolve o corpo exato do resultado', async () => {
    const response = await GET(request('cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ reconciled: 1, alarms: ['alarme-a', 'alarme-b'] });
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it('falha do job devolve 500 e registra o erro', async () => {
    const erro = new Error('falha-sintetica-gap023');
    mocks.reconcile.mockRejectedValue(erro);
    const response = await GET(request('cron-secret-test'));
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({ error: 'Internal server error' });
    expect(vi.mocked(logger.error).mock.calls).toEqual([
      [
        'Cron de reconciliacao Google Calendar falhou',
        { action: 'cron.google-calendar-reconciliation' },
        erro,
      ],
    ]);
  });
});
