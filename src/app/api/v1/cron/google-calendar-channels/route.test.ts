// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const SINT = 'mensagem-sintetica-gap11';

const mocks = vi.hoisted(() => ({ renew: vi.fn() }));

vi.mock('@/services/cron.service', () => ({
  cronService: { renewGoogleCalendarChannels: mocks.renew },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function request(token?: string) {
  return new NextRequest('http://localhost/api/v1/cron/google-calendar-channels', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe('GET /api/v1/cron/google-calendar-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-test';
    mocks.renew.mockResolvedValue({ renewed: 2, errors: ['user-internal'] });
  });

  it('retorna 401 sem segredo valido', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.renew).not.toHaveBeenCalled();
  });

  it('executa o job e retorna apenas contagens agregadas', async () => {
    const response = await GET(request('cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ renewed: 2, failed: 1 });
    expect(mocks.renew).toHaveBeenCalledTimes(1);
  });

  it('[RED L2] falha registra so nome e codigo do erro', async () => {
    mocks.renew.mockRejectedValue(new AppError('GOOGLE_API_ERROR', SINT, 502));
    expect((await GET(request('cron-secret-test'))).status).toBe(500);
    expect(vi.mocked(logger.error).mock.calls).toEqual([
      [
        'Cron de canais Google Calendar falhou',
        { action: 'cron.google-calendar-channels', errorName: 'AppError', errorCode: 'GOOGLE_API_ERROR' },
      ],
    ]);
  });
});
