// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const JOB = 'google-calendar-reconciliation';
const SCHEDULE = '0 * * * *';

const mocks = vi.hoisted(() => ({
  runCreditExpiration: vi.fn(),
  runReminders: vi.fn(),
  runAutoConfirmation: vi.fn(),
  runGoogleCalendarReconciliation: vi.fn(),
}));

vi.mock('@/services/cron.service', () => ({
  cronService: mocks,
}));

import { POST } from './route';

interface VercelConfig {
  crons: Array<{ path: string; schedule: string }>;
}

interface Pm2App {
  name: string;
  script: string;
  cron_restart?: string;
  env?: { JOB?: string };
}

interface EcosystemConfig {
  apps: Pm2App[];
}

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
});
