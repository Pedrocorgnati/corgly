// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const JOB = 'google-calendar-reconciliation';
const SCHEDULE = '0 * * * *';
const SINT = 'mensagem-sintetica-gap11';

const mocks = vi.hoisted(() => ({
  runCreditExpiration: vi.fn(),
  runReminders: vi.fn(),
  runAutoConfirmation: vi.fn(),
  runGoogleCalendarReconciliation: vi.fn(),
  renewGoogleCalendarChannels: vi.fn(),
}));

vi.mock('@/services/cron.service', () => ({
  cronService: mocks,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

interface VercelConfig {
  crons: Array<{ path: string; schedule: string }>;
}

interface Pm2App {
  name: string;
  script: string;
  cron_restart?: string;
  autorestart?: boolean;
  error_file?: string;
  out_file?: string;
  env?: { JOB?: string };
}

interface EcosystemConfig {
  apps: Pm2App[];
}

const vercel = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig;
const eco = createRequire(import.meta.url)(
  resolve(process.cwd(), 'ecosystem.config.js'),
) as EcosystemConfig;

function request(job: string) {
  return new NextRequest('http://localhost/api/cron', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job }),
  });
}

describe('POST /api/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-test';
    mocks.runGoogleCalendarReconciliation.mockResolvedValue({
      reconciled: 2,
      alarms: [],
    });
  });

  it('aceita e despacha o job de reconciliacao do Google Calendar', async () => {
    const response = await POST(request(JOB));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, jobRan: JOB });
    expect(mocks.runGoogleCalendarReconciliation).toHaveBeenCalledTimes(1);
  });

  it('informa o job de reconciliacao na allowlist', async () => {
    const response = await POST(request('invalid-job'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Invalid job name',
      validJobs: expect.arrayContaining([JOB]),
    });
  });

  it('mantem identificador unico e cadencia identica no Vercel e no PM2', () => {
    const workspaceRoot = process.cwd();
    const vercelConfig = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'vercel.json'), 'utf8'),
    ) as VercelConfig;
    const requireFromTest = createRequire(import.meta.url);
    const ecosystem = requireFromTest(
      resolve(workspaceRoot, 'ecosystem.config.js'),
    ) as EcosystemConfig;

    const vercelEntries = vercelConfig.crons.filter(
      ({ path }) => path === `/api/v1/cron/${JOB}`,
    );
    const pm2Apps = ecosystem.apps.filter(({ env }) => env?.JOB === JOB);

    expect(vercelEntries).toHaveLength(1);
    expect(pm2Apps).toHaveLength(1);
    expect(pm2Apps[0]).toMatchObject({
      name: 'corgly-cron-google-calendar-reconciliation',
      script: 'scripts/trigger-cron.js',
      env: { JOB },
    });
    expect(vercelEntries[0]?.schedule).toBe(SCHEDULE);
    expect(pm2Apps[0]?.cron_restart).toBe(SCHEDULE);
  });

  it('[RED A1] despacha google-calendar-channels', async () => {
    mocks.renewGoogleCalendarChannels.mockResolvedValue({ renewed: 1, errors: [] });
    const res = await POST(request('google-calendar-channels'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, jobRan: 'google-calendar-channels' });
    expect(mocks.renewGoogleCalendarChannels).toHaveBeenCalledTimes(1);
  });

  it('[RED A3] allowlist anuncia google-calendar-channels', async () => {
    const res = await POST(request('job-inexistente'));
    expect(res.status).toBe(400);
    expect((await res.json()).validJobs).toContain('google-calendar-channels');
  });

  it('[RED A2] agenda de canais igual no Vercel e no PM2', () => {
    const v = vercel.crons.filter((c) => c.path === '/api/v1/cron/google-calendar-channels');
    const p = eco.apps.filter((a) => a.env?.JOB === 'google-calendar-channels');
    expect(v).toHaveLength(1);
    expect(p).toHaveLength(1);
    expect(v[0].schedule).toBe('0 */6 * * *');
    expect(p[0]).toMatchObject({
      name: 'corgly-cron-google-calendar-channels',
      script: 'scripts/trigger-cron.js',
      cron_restart: v[0].schedule,
      autorestart: false,
      error_file: 'logs/cron-google-calendar-channels-error.log',
      out_file: 'logs/cron-google-calendar-channels-out.log',
    });
  });

  it('[RED L1] falha do job nao expoe mensagem nem stack', async () => {
    mocks.runGoogleCalendarReconciliation.mockRejectedValue(new AppError('GOOGLE_API_ERROR', SINT, 502));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(request(JOB));
    const body = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(body).toContain('"error":"Job failed"');
    expect(body).not.toContain(SINT);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error).mock.calls).toEqual([
      [
        '[POST /api/cron] job failed',
        { action: 'cron.dispatch', job: JOB, errorName: 'AppError', errorCode: 'GOOGLE_API_ERROR' },
      ],
    ]);
    spy.mockRestore();
  });

  const semJob = () => Object.values(mocks).every((m) => m.mock.calls.length === 0);

  it('[CONTROLE A4] sem Authorization devolve 401 sem despachar job', async () => {
    const res = await POST(new NextRequest('http://localhost/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: JOB }),
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(semJob()).toBe(true);
  });

  it('[CONTROLE A5] Bearer errado devolve 401 sem despachar job', async () => {
    const res = await POST(new NextRequest('http://localhost/api/cron', {
      method: 'POST',
      headers: { Authorization: 'Bearer valor-sintetico-errado', 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: JOB }),
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(semJob()).toBe(true);
  });
});
