// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
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

const SENTINELA = 'detalhe-interno-sintetico-gap10';
const ACTION = 'cron.google-calendar-reconciliation';

// JSON.stringify de Error devolve {}; o substituto expoe name, message e stack.
const expoeErro = (_chave: string, valor: unknown) =>
  valor instanceof Error ? { name: valor.name, message: valor.message, stack: valor.stack } : valor;

async function expectFalhaSemErroBruto(errorName: string, errorCode: string | undefined): Promise<void> {
  const res = await GET(request('cron-secret-test'));
  const body: unknown = await res.json();
  expect(res.status).toBe(500);
  expect(body).toEqual({ error: 'Internal server error' });
  const chamadas: unknown[][] = vi.mocked(logger.error).mock.calls;
  expect(chamadas).toHaveLength(1);
  const chamada = chamadas[0] ?? [];
  expect(chamada.length).toBe(2);
  expect(chamada[0]).toBe('Cron de reconciliacao Google Calendar falhou');
  expect(chamada[1]).toMatchObject({ action: ACTION, errorName });
  expect((chamada[1] as Record<string, unknown> | undefined)?.errorCode).toBe(errorCode);
  const serializado = JSON.stringify([chamadas, body], expoeErro);
  expect(serializado.includes(SENTINELA)).toBe(false);
  expect(serializado.includes('stack')).toBe(false);
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

  it('RED V1: AppError da listagem vira 500 fixo e log so com nome e codigo', async () => {
    mocks.reconcile.mockRejectedValue(
      new AppError('GOOGLE_RECONCILIATION_LIST_FAILED', SENTINELA, 500),
    );
    await expectFalhaSemErroBruto('AppError', 'GOOGLE_RECONCILIATION_LIST_FAILED');
  });

  it('RED V2: erro inesperado vira 500 fixo e log so com o nome', async () => {
    mocks.reconcile.mockRejectedValue(new Error(SENTINELA));
    await expectFalhaSemErroBruto('Error', undefined);
  });
});
