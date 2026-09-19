import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronService } from '../cron.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import * as pushService from '../google-calendar-push.service';
import { AppError } from '@/lib/errors';

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

const SENTINELA = 'detalhe-interno-sintetico-gap10';
const ACTION = 'cron.google-calendar-reconciliation';
const PREFIXO = '[CronService.runGoogleCalendarReconciliation] ';

function duasHorasAtras(): Date {
  return new Date(Date.now() - 2 * 60 * 60 * 1000);
}

function erroComCodigo(name: string, code: string): Error & { code: string } {
  return Object.assign(new Error(SENTINELA), { name, code });
}

function jobCriado(id: string): CreatedJob {
  return {
    id,
    type: 'GOOGLE_CALENDAR_RECONCILIATION',
    status: 'RUNNING',
    startedAt: new Date(),
  } as unknown as CreatedJob;
}

function syncVazio() {
  return { eventosProcessados: 0, bloqueados: [], liberados: [], conflitos: [] };
}

// O beforeEach so limpa chamadas; implementacoes e filas `Once` de um caso
// nao podem vazar para o proximo.
function resetMocks(): void {
  vi.mocked(prisma.googleCalendarCredential.findMany).mockReset();
  vi.mocked(prisma.job.create).mockReset();
  vi.mocked(prisma.job.update).mockReset();
  vi.mocked(pushService.googleCalendarPushService.initialSync).mockReset();
  vi.mocked(logger.error).mockReset();
  vi.mocked(logger.warn).mockReset();
}

// JSON.stringify de Error devolve {}; o substituto expoe name e message.
const expoeErro = (_chave: string, valor: unknown) =>
  valor instanceof Error ? { name: valor.name, message: valor.message } : valor;

function expectSemErroBruto(): void {
  for (const chamada of vi.mocked(logger.error).mock.calls) {
    expect(chamada.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(chamada, expoeErro)).not.toContain(SENTINELA);
  }
  expect(JSON.stringify(vi.mocked(prisma.job.update).mock.calls, expoeErro)).not.toContain(SENTINELA);
}

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

  it('RED J1: falha na listagem registra stage list e relanca AppError sem a mensagem original', async () => {
    resetMocks();
    vi.mocked(prisma.googleCalendarCredential.findMany).mockRejectedValue(
      erroComCodigo('PrismaClientKnownRequestError', 'P2024'),
    );

    const erro = await cronService.runGoogleCalendarReconciliation().then(
      () => null,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(AppError);
    expect(erro).toMatchObject({ code: 'GOOGLE_RECONCILIATION_LIST_FAILED', status: 500 });
    expect((erro as Error).message).not.toContain(SENTINELA);
    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'credential listing failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'list',
        errorName: 'PrismaClientKnownRequestError',
        errorCode: 'P2024',
      }),
    );
    expect(prisma.job.create).not.toHaveBeenCalled();
    expectSemErroBruto();
  });

  it('RED J2: falha ao criar o Job registra stage job-create e segue para a proxima credencial', async () => {
    resetMocks();
    mockFoundCredentials(
      { userId: 'user-a', lastSyncAt: duasHorasAtras() },
      { userId: 'user-b', lastSyncAt: duasHorasAtras() },
    );
    vi.mocked(prisma.job.create)
      .mockRejectedValueOnce(erroComCodigo('PrismaClientKnownRequestError', 'P2002'))
      .mockResolvedValueOnce(jobCriado('job-b'));
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockResolvedValue(syncVazio());

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'job create failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'job-create',
        userId: 'user-a',
        errorName: 'PrismaClientKnownRequestError',
        errorCode: 'P2002',
      }),
    );
    expect(pushService.googleCalendarPushService.initialSync).toHaveBeenCalledTimes(1);
    expect(pushService.googleCalendarPushService.initialSync).toHaveBeenCalledWith('user-b');
    expect(result.reconciled).toBe(1);
    expect(result.alarms).toHaveLength(2);
    expectSemErroBruto();
  });

  it('RED J3: falha de sincronizacao com AppError grava texto fixo no Job e nome e codigo no log', async () => {
    resetMocks();
    mockFoundCredentials({ userId: 'user-j3', lastSyncAt: duasHorasAtras() });
    vi.mocked(prisma.job.create).mockResolvedValue(jobCriado('job-j3'));
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockRejectedValue(
      new AppError('GOOGLE_SYNC_BUSY', SENTINELA, 503),
    );

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(0);
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-j3' },
        data: expect.objectContaining({
          status: 'FAILED',
          finalErrorCode: 'RECONCILIATION_FAILED',
          finalErrorMessage: 'Falha na sincronizacao da reconciliacao.',
        }),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'reconciliation failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'sync',
        userId: 'user-j3',
        jobId: 'job-j3',
        errorName: 'AppError',
        errorCode: 'GOOGLE_SYNC_BUSY',
      }),
    );
    expectSemErroBruto();
  });

  it('RED J4: falha ao marcar o Job como FAILED registra stage job-update e nao aborta as demais credenciais', async () => {
    resetMocks();
    mockFoundCredentials(
      { userId: 'user-a', lastSyncAt: duasHorasAtras() },
      { userId: 'user-b', lastSyncAt: duasHorasAtras() },
    );
    vi.mocked(prisma.job.create)
      .mockResolvedValueOnce(jobCriado('job-a'))
      .mockResolvedValueOnce(jobCriado('job-b'));
    vi.mocked(pushService.googleCalendarPushService.initialSync)
      .mockRejectedValueOnce(new AppError('GOOGLE_SYNC_LEASE_LOST', SENTINELA, 409))
      .mockResolvedValueOnce(syncVazio());
    vi.mocked(prisma.job.update)
      .mockRejectedValueOnce(erroComCodigo('PrismaClientKnownRequestError', 'P2025'))
      .mockResolvedValue({} as UpdatedJob);

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'reconciliation failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'sync',
        userId: 'user-a',
        jobId: 'job-a',
        errorCode: 'GOOGLE_SYNC_LEASE_LOST',
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'job update failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'job-update',
        userId: 'user-a',
        jobId: 'job-a',
        errorCode: 'P2025',
      }),
    );
    expect(pushService.googleCalendarPushService.initialSync).toHaveBeenCalledWith('user-b');
    expect(result.reconciled).toBe(1);
    expectSemErroBruto();
  });

  it('RED J5: falha ao marcar o Job como SUCCEEDED registra stage job-update sem desfazer a sincronizacao', async () => {
    resetMocks();
    mockFoundCredentials({ userId: 'user-j5', lastSyncAt: duasHorasAtras() });
    vi.mocked(prisma.job.create).mockResolvedValue(jobCriado('job-j5'));
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockResolvedValue(syncVazio());
    vi.mocked(prisma.job.update).mockRejectedValueOnce(
      erroComCodigo('PrismaClientKnownRequestError', 'P2034'),
    );

    const result = await cronService.runGoogleCalendarReconciliation();

    expect(result.reconciled).toBe(1);
    expect(prisma.job.update).toHaveBeenCalledTimes(1);
    expect(prisma.job.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'job update failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'job-update',
        userId: 'user-j5',
        jobId: 'job-j5',
        errorCode: 'P2034',
      }),
    );
    expectSemErroBruto();
  });

  it('RED J7: falha de sincronizacao grava texto fixo no Job', async () => {
    resetMocks();
    mockFoundCredentials({ userId: 'user-2', lastSyncAt: duasHorasAtras() });
    vi.mocked(prisma.job.create).mockResolvedValue(jobCriado('job-2'));
    vi.mocked(prisma.job.update).mockResolvedValue({} as UpdatedJob);
    vi.mocked(pushService.googleCalendarPushService.initialSync).mockRejectedValue(
      new Error(SENTINELA),
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
          finalErrorMessage: 'Falha na sincronizacao da reconciliacao.',
        }),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      PREFIXO + 'reconciliation failed',
      expect.objectContaining({
        action: ACTION,
        stage: 'sync',
        userId: 'user-2',
        jobId: 'job-2',
        errorName: 'Error',
      }),
    );
    expectSemErroBruto();
  });
});
