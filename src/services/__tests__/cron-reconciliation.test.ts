import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronService } from '../cron.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import * as pushService from '../google-calendar-push.service';

type CreatedJob = Awaited<ReturnType<typeof prisma.job.create>>;
type UpdatedJob = Awaited<ReturnType<typeof prisma.job.update>>;
type FoundCredentials = Awaited<
  ReturnType<typeof prisma.googleCalendarCredential.findMany>
>;
type ReconciliationCredential = Pick<
  FoundCredentials[number],
  'userId' | 'lastSyncAt'
>;

function mockFoundCredentials(...credentials: ReconciliationCredential[]) {
  vi.mocked(prisma.googleCalendarCredential.findMany).mockResolvedValue(
    credentials as FoundCredentials,
  );
}

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    googleCalendarCredential: {
      findMany: vi.fn(),
    },
    job: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../google-calendar-push.service', () => ({
  googleCalendarPushService: {
    initialSync: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  JobType: {
    GOOGLE_CALENDAR_RECONCILIATION: 'GOOGLE_CALENDAR_RECONCILIATION',
  },
  JobStatus: {
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
}));

describe('CronService.runGoogleCalendarReconciliation', () => {
  let cronService: CronService;

  beforeEach(() => {
    cronService = new CronService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cenario 1: execucao bem sucedida com credencial envelhecida', async () => {
    // Credencial com lastSyncAt > 1h
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h atras
    const mockCredential = {
      userId: 'user-1',
      lastSyncAt: staleDate,
    };

    mockFoundCredentials(mockCredential);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: 'job-1',
      type: 'GOOGLE_CALENDAR_RECONCILIATION',
      status: 'RUNNING',
      startedAt: new Date(),
      payload: { userId: 'user-1' },
    } as unknown as CreatedJob);
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockResolvedValue({
      eventosProcessados: 5,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    });

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(1);
    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0]).toContain('user=user-1');
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'GOOGLE_CALENDAR_RECONCILIATION',
          status: 'RUNNING',
          payload: { userId: 'user-1' },
        }),
      })
    );
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
        }),
      })
    );
    expect(pushService.googleCalendarPushService.initialSync).toHaveBeenCalledWith('user-1');
  });

  it('cenario 2: falha com registro', async () => {
    // Credencial com lastSyncAt > 1h
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const mockCredential = {
      userId: 'user-2',
      lastSyncAt: staleDate,
    };

    mockFoundCredentials(mockCredential);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: 'job-2',
      type: 'GOOGLE_CALENDAR_RECONCILIATION',
      status: 'RUNNING',
      startedAt: new Date(),
      payload: { userId: 'user-2' },
    } as unknown as CreatedJob);
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockRejectedValue(
      new Error('Sync failed')
    );

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(0);
    expect(result.alarms).toHaveLength(1);
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-2' },
        data: expect.objectContaining({
          status: 'FAILED',
          finalErrorCode: 'RECONCILIATION_FAILED',
          finalErrorMessage: 'Sync failed',
        }),
      })
    );
  });

  it('cenario 3: alarme de carimbo envelhecido', async () => {
    // Credencial com lastSyncAt > 1h (2h atras)
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const mockCredential = {
      userId: 'user-3',
      lastSyncAt: staleDate,
    };

    mockFoundCredentials(mockCredential);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: 'job-3',
      type: 'GOOGLE_CALENDAR_RECONCILIATION',
      status: 'RUNNING',
      startedAt: new Date(),
    } as unknown as CreatedJob);
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockResolvedValue({
      eventosProcessados: 0,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    });

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0]).toContain('lastSync=');
    expect(result.alarms[0]).toContain('user=user-3');
    expect(logger.warn).toHaveBeenCalledWith(
      '[CronService.runGoogleCalendarReconciliation] stale sync detected',
      {
        action: 'cron.google-calendar-reconciliation',
        userId: 'user-3',
        lastSyncAt: staleDate,
      }
    );
  });

  it('cenario 4: nenhuma credencial envelhecida', async () => {
    // Credencial com lastSyncAt recente (< 1h)
    const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 min atras
    const mockCredential = {
      userId: 'user-4',
      lastSyncAt: recentDate,
    };

    mockFoundCredentials(mockCredential);

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(0);
    expect(result.alarms).toHaveLength(0);
    // Nenhum Job deve ser criado
    expect(prisma.job.create).not.toHaveBeenCalled();
    expect(pushService.googleCalendarPushService.initialSync).not.toHaveBeenCalled();
  });

  it('cenario 5: credencial sem lastSyncAt (never synced)', async () => {
    // Credencial sem lastSyncAt (null)
    const mockCredential = {
      userId: 'user-5',
      lastSyncAt: null,
    };

    mockFoundCredentials(mockCredential);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: 'job-5',
      type: 'GOOGLE_CALENDAR_RECONCILIATION',
      status: 'RUNNING',
      startedAt: new Date(),
    } as unknown as CreatedJob);
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockResolvedValue({
      eventosProcessados: 3,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    });

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(1);
    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0]).toContain('lastSync=never');
  });
});
