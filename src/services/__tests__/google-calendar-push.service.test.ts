// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

const clientMocks = vi.hoisted(() => ({
  watchEvents: vi.fn(),
  stopWatch: vi.fn(),
  fullSync: vi.fn(),
  syncIncremental: vi.fn(),
}));

const projectionMocks = vi.hoisted(() => ({
  full: vi.fn(),
  incremental: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    googleCalendarCredential: {
      findUnique: prismaMocks.findUnique,
      update: prismaMocks.update,
      updateMany: prismaMocks.updateMany,
    },
  },
}));

vi.mock('@/lib/google/calendar-client', () => ({
  getCalendarClient: vi.fn(async () => clientMocks),
}));

vi.mock('@/lib/env', () => ({
  getGoogleCalendarWebhookConfig: () => ({
    webhookUrl: 'https://corgly.test/api/v1/google/calendar/webhook',
  }),
}));

vi.mock('@/lib/google/credential-crypto', () => ({
  encryptCredential: (value: string) => `enc:${value}`,
  decryptCredential: (value: string) => value.replace(/^enc:/, ''),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/google-calendar-sync.service', () => ({
  googleCalendarSyncService: {
    applyFullSnapshot: projectionMocks.full,
    applyIncrementalChanges: projectionMocks.incremental,
  },
}));

import { GoogleCalendarPushService } from '../google-calendar-push.service';

const EMPTY_RESULT = {
  eventosProcessados: 0,
  bloqueados: [],
  liberados: [],
  conflitos: [],
};

function leaseOwnerAfterCredential(credential: Record<string, unknown>) {
  let reads = 0;
  prismaMocks.findUnique.mockImplementation(async () => {
    reads++;
    if (reads === 1) return credential;
    const leaseId = prismaMocks.updateMany.mock.calls[0]?.[0]?.data?.syncLeaseId;
    return { syncLeaseId: leaseId };
  });
}

describe('GoogleCalendarPushService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.update.mockResolvedValue({});
    prismaMocks.updateMany.mockResolvedValue({ count: 1 });
    clientMocks.watchEvents.mockResolvedValue({
      channelId: 'channel-new',
      resourceId: 'resource-new',
      expiration: new Date('2026-09-16T00:00:00Z'),
    });
    clientMocks.stopWatch.mockResolvedValue(undefined);
    clientMocks.fullSync.mockResolvedValue({ events: [], nextSyncToken: 'sync-next' });
    clientMocks.syncIncremental.mockResolvedValue({ events: [], nextSyncToken: 'sync-next' });
    projectionMocks.full.mockResolvedValue(EMPTY_RESULT);
    projectionMocks.incremental.mockResolvedValue(EMPTY_RESULT);
  });

  it('persiste pending cifrado antes de watch e executa o baseline', async () => {
    prismaMocks.findUnique.mockResolvedValue({
      channelId: null,
      resourceId: null,
      channelExpiration: null,
      channelTokenEnc: null,
    });
    const service = new GoogleCalendarPushService();
    const initialSync = vi.spyOn(service, 'initialSync').mockResolvedValue(EMPTY_RESULT);
    clientMocks.watchEvents.mockImplementation(async () => {
      expect(prismaMocks.update).toHaveBeenCalledTimes(1);
      return {
        channelId: prismaMocks.update.mock.calls[0][0].data.channelId,
        resourceId: 'resource-new',
        expiration: new Date('2026-09-16T00:00:00Z'),
      };
    });

    await service.createChannel('user-1');

    expect(prismaMocks.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
      resourceId: null,
      channelExpiration: null,
      channelTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      channelTokenEnc: expect.stringMatching(/^enc:/),
      lastMessageNumber: null,
    }));
    expect(initialSync).toHaveBeenCalledWith('user-1');
  });

  it('retoma pending com o mesmo channelId e token', async () => {
    prismaMocks.findUnique.mockResolvedValue({
      channelId: 'pending-channel',
      resourceId: null,
      channelExpiration: null,
      channelTokenEnc: 'enc:pending-token',
    });
    clientMocks.watchEvents.mockResolvedValue({
      channelId: 'pending-channel',
      resourceId: 'resource-new',
      expiration: new Date('2026-09-16T00:00:00Z'),
    });
    const service = new GoogleCalendarPushService();
    vi.spyOn(service, 'initialSync').mockResolvedValue(EMPTY_RESULT);

    await service.createChannel('user-1');

    expect(prismaMocks.update).not.toHaveBeenCalled();
    expect(clientMocks.watchEvents).toHaveBeenCalledWith(
      expect.any(String),
      'pending-channel',
      'pending-token',
    );
  });

  it('preserva estado local quando stop remoto falha', async () => {
    prismaMocks.findUnique.mockResolvedValue({ channelId: 'channel-1', resourceId: 'resource-1' });
    clientMocks.stopWatch.mockRejectedValue(new AppError('GOOGLE_API_ERROR', 'Google 503', 502));
    const service = new GoogleCalendarPushService();

    await expect(service.stopCurrentChannel('user-1')).rejects.toMatchObject({
      code: 'GOOGLE_API_ERROR',
    });
    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
  });

  it('limpa estado somente depois de stop remoto concluido', async () => {
    prismaMocks.findUnique.mockResolvedValue({ channelId: 'channel-1', resourceId: 'resource-1' });
    const service = new GoogleCalendarPushService();

    await service.stopCurrentChannel('user-1');

    expect(clientMocks.stopWatch).toHaveBeenCalledWith('channel-1', 'resource-1');
    expect(prismaMocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', channelId: 'channel-1' },
    }));
  });

  it('ignora notificacao duplicada sem chamar Google', async () => {
    prismaMocks.findUnique.mockResolvedValue({
      syncToken: 'sync-current',
      channelId: 'channel-1',
      lastMessageNumber: BigInt(10),
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
    });
    const service = new GoogleCalendarPushService();

    expect(await service.incrementalSync('user-1', {
      channelId: 'channel-1',
      messageNumber: BigInt(10),
    })).toEqual(EMPTY_RESULT);
    expect(clientMocks.syncIncremental).not.toHaveBeenCalled();
    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
  });

  it('full sync provocado por notificacao persiste messageNumber com o token', async () => {
    leaseOwnerAfterCredential({
      syncToken: null,
      channelId: 'channel-1',
      lastMessageNumber: null,
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
    });
    const service = new GoogleCalendarPushService();

    await service.incrementalSync('user-1', {
      channelId: 'channel-1',
      messageNumber: BigInt(11),
    });

    expect(prismaMocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncToken: 'sync-next', lastMessageNumber: BigInt(11) }),
    }));
  });

  it('410 limpa token antes do full e deixa null se o resync falhar', async () => {
    leaseOwnerAfterCredential({
      syncToken: 'expired-token',
      channelId: 'channel-1',
      lastMessageNumber: BigInt(10),
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
    });
    clientMocks.syncIncremental.mockRejectedValue(
      new AppError('GOOGLE_SYNC_TOKEN_EXPIRED', 'expired', 410),
    );
    clientMocks.fullSync.mockRejectedValue(new Error('full sync failed'));
    const service = new GoogleCalendarPushService();

    await expect(service.incrementalSync('user-1', {
      channelId: 'channel-1',
      messageNumber: BigInt(11),
    })).rejects.toThrow('full sync failed');

    const clearCall = prismaMocks.updateMany.mock.calls.find(
      ([arg]) => arg.data?.syncToken === null,
    );
    expect(clearCall).toBeDefined();
  });

  it('renovacao persiste o novo canal antes de parar o antigo', async () => {
    const current = {
      channelId: 'channel-old',
      resourceId: 'resource-old',
      channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
      channelTokenEnc: null,
      syncToken: 'sync-current',
    };
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    const order: string[] = [];
    prismaMocks.update.mockImplementation(async () => { order.push('pending'); return {}; });
    clientMocks.watchEvents.mockImplementation(async (_url, channelId) => {
      order.push('watch');
      return {
        channelId,
        resourceId: 'resource-new',
        expiration: new Date('2026-09-16T00:00:00Z'),
      };
    });
    prismaMocks.updateMany.mockImplementation(async () => { order.push('persisted'); return { count: 1 }; });
    clientMocks.stopWatch.mockImplementation(async () => { order.push('stopped-old'); });
    const service = new GoogleCalendarPushService();

    expect(await service.renewChannel('user-1')).toBe(true);
    expect(order).toEqual(['watch', 'persisted', 'stopped-old']);
  });

  const isola = (s: GoogleCalendarPushService) =>
    vi.spyOn(s as unknown as { provisionChannel: () => Promise<unknown> }, 'provisionChannel').mockResolvedValue({});
  const avisosDeExpiracao = () => vi.mocked(logger.warn).mock.calls.filter(([, ctx]) => {
    const action = (ctx as { action?: string } | undefined)?.action;
    return action === 'google-calendar.channel.missing' || action === 'google-calendar.channel.expired';
  });

  it('[RED D1] expiracao ausente gera aviso com full sync', async () => {
    prismaMocks.findUnique.mockResolvedValueOnce({
      channelId: 'channel-old',
      resourceId: 'resource-old',
      channelExpiration: null,
      syncToken: 'sync-current',
    });
    const service = new GoogleCalendarPushService();
    isola(service);
    expect(await service.renewChannel('user-1')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: 'google-calendar.channel.missing', userId: 'user-1', fullSync: true }),
    );
  });

  it('[RED D2] expiracao vencida gera aviso', async () => {
    prismaMocks.findUnique.mockResolvedValueOnce({
      channelId: 'channel-old',
      resourceId: 'resource-old',
      channelExpiration: new Date(Date.now() - 60 * 60 * 1000),
      syncToken: 'sync-current',
    });
    const service = new GoogleCalendarPushService();
    isola(service);
    expect(await service.renewChannel('user-1')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: 'google-calendar.channel.expired', userId: 'user-1' }),
    );
  });

  it('[CONTROLE D3] expiracao futura nao gera aviso de ausente nem de vencido', async () => {
    prismaMocks.findUnique.mockResolvedValueOnce({
      channelId: 'channel-old',
      resourceId: 'resource-old',
      channelExpiration: new Date(Date.now() + 2 * 60 * 60 * 1000),
      syncToken: 'sync-current',
    });
    const service = new GoogleCalendarPushService();
    isola(service);
    expect(await service.renewChannel('user-1')).toBe(true);
    expect(avisosDeExpiracao()).toEqual([]);
  });

  it('[REGRESSAO E1] canal antigo so para depois da promocao', async () => {
    const current = {
      channelId: 'channel-old',
      resourceId: 'resource-old',
      channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
      channelTokenEnc: null,
      syncToken: 'sync-current',
    };
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    const order: string[] = [];
    prismaMocks.updateMany.mockImplementation(async () => { order.push('persisted'); return { count: 1 }; });
    clientMocks.stopWatch.mockImplementation(async (id: string) => { order.push(`stop:${id}`); });
    await new GoogleCalendarPushService().renewChannel('user-1');
    expect(clientMocks.stopWatch).toHaveBeenCalledWith('channel-old', 'resource-old');
    expect(order.indexOf('persisted')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('stop:channel-old')).toBeGreaterThan(order.indexOf('persisted'));
  });

  const canalAtual = () => ({
    channelId: 'channel-old',
    resourceId: 'resource-old',
    channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
    channelTokenEnc: null,
    syncToken: 'sync-current',
  });
  const CHAVES_DE_CANAL = ['channelId', 'channelTokenHash', 'resourceId', 'channelExpiration'];

  it('[RED W1] canal persistido segue o antigo durante o watch', async () => {
    const current = canalAtual();
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    let gravado: string[] = [];
    clientMocks.watchEvents.mockImplementation(async (_url: string, channelId: string) => {
      gravado = prismaMocks.update.mock.calls.flatMap(([a]) => Object.keys((a as { data: object }).data));
      return { channelId, resourceId: 'resource-new', expiration: new Date('2026-09-16T00:00:00Z') };
    });
    await new GoogleCalendarPushService().renewChannel('user-1');
    expect(gravado.filter((k) => ['channelId', 'channelTokenHash', 'resourceId'].includes(k))).toEqual([]);
  });

  it('[REGRESSAO W2] promocao grava resource e expiracao do canal novo', async () => {
    const current = canalAtual();
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    await new GoogleCalendarPushService().renewChannel('user-1');
    const ultimo = prismaMocks.updateMany.mock.calls.at(-1)?.[0] as { data: object } | undefined;
    expect(ultimo?.data).toEqual(expect.objectContaining({
      resourceId: 'resource-new',
      channelExpiration: expect.any(Date),
    }));
  });

  it('[REGRESSAO W3] promocao sem linha rejeita e preserva o canal antigo', async () => {
    const current = canalAtual();
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(new GoogleCalendarPushService().renewChannel('user-1'))
      .rejects.toMatchObject({ code: 'GOOGLE_CHANNEL_STATE_CHANGED' });
    expect(clientMocks.stopWatch).not.toHaveBeenCalledWith('channel-old', expect.anything());
  });

  it('[RED W5] falha do watch nao altera o canal corrente', async () => {
    const current = canalAtual();
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    const erro = new AppError('GOOGLE_API_ERROR', 'Google 503', 502);
    clientMocks.watchEvents.mockRejectedValue(erro);
    await expect(new GoogleCalendarPushService().renewChannel('user-1')).rejects.toBe(erro);
    const gravado = [...prismaMocks.update.mock.calls, ...prismaMocks.updateMany.mock.calls]
      .flatMap(([a]) => Object.keys((a as { data: object }).data));
    expect(gravado.filter((k) => CHAVES_DE_CANAL.includes(k))).toEqual([]);
    expect(clientMocks.stopWatch).not.toHaveBeenCalledWith('channel-old', expect.anything());
  });

  it('[REGRESSAO W6] falha ao parar o antigo depois da promocao so gera aviso', async () => {
    const current = canalAtual();
    prismaMocks.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(current);
    const order: string[] = [];
    prismaMocks.update.mockImplementation(async () => { order.push('update'); return {}; });
    prismaMocks.updateMany.mockImplementation(async () => { order.push('updateMany'); return { count: 1 }; });
    clientMocks.stopWatch.mockImplementation(async () => {
      order.push('stop');
      throw new AppError('GOOGLE_API_ERROR', 'Google 503', 502);
    });
    expect(await new GoogleCalendarPushService().renewChannel('user-1')).toBe(true);
    const promocao = order.indexOf('updateMany');
    expect(promocao).toBeGreaterThanOrEqual(0);
    expect(order.slice(promocao + 1).filter((o) => o !== 'stop')).toEqual([]);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: 'google-calendar.channel.replace', userId: 'user-1' }),
    );
  });
});
