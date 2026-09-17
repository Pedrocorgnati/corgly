/**
 * Servico de push notifications do Google Calendar (item 022 do loop).
 *
 * Responsavel por:
 *  - Criar e renovar canais push via events.watch
 *  - Sincronizacao incremental usando syncToken
 *  - Tratamento de 410 GONE com resync completo
 *  - Lease distribuido para evitar sincronizacao concorrente
 *
 * Regras:
 *  - Canal expira em ~7 dias; renovar antes
 *  - syncToken invalido (410 GONE) dispara full sync
 *  - Lease distribuido com TTL de 2 minutos
 */

import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { getCalendarClient } from '@/lib/google/calendar-client';
import { getGoogleCalendarWebhookConfig } from '@/lib/env';
import { decryptCredential, encryptCredential } from '@/lib/google/credential-crypto';
import { logger } from '@/lib/logger';
import { googleCalendarSyncService } from './google-calendar-sync.service';
import crypto from 'crypto';

const LEASE_TTL_MS = 2 * 60 * 1000; // 2 minutos
const DEFAULT_TIME_HORIZON_DAYS = 90;

/** Resultado de sincronizacao. */
export interface SyncResult {
  eventosProcessados: number;
  bloqueados: string[];
  liberados: string[];
  /**
   * Item 025: `conflictId` aponta a linha de `external_busy_conflicts` e
   * `sessionId` a aula vendida. Opcionais para nao quebrar quem so conta
   * `conflitos.length` (a rota de sync).
   */
  conflitos: Array<{ slotId: string; motivo: string; conflictId?: string; sessionId?: string }>;
}

/**
 * Gera token aleatorio de 256 bits (32 bytes) em hex.
 */
function generateChannelToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Gera hash SHA-256 de uma string.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Adquire lease distribuido para sincronizacao.
 * Retorna leaseId se adquirido, null se ocupado.
 */
async function acquireLease(userId: string): Promise<string | null> {
  const leaseId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);

  const result = await prisma.googleCalendarCredential.updateMany({
    where: {
      userId,
      OR: [
        { syncLeaseExpiresAt: null },
        { syncLeaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      syncLeaseId: leaseId,
      syncLeaseExpiresAt: expiresAt,
    },
  });

  return result.count > 0 ? leaseId : null;
}

/**
 * Libera lease distribuido.
 * So libera se ainda pertencer ao chamador.
 */
async function releaseLease(userId: string, leaseId: string): Promise<void> {
  await prisma.googleCalendarCredential.updateMany({
    where: {
      userId,
      syncLeaseId: leaseId,
    },
    data: {
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
    },
  });
}

/**
 * Verifica se o lease ainda pertence ao chamador.
 */
async function isLeaseOwner(userId: string, leaseId: string): Promise<boolean> {
  const cred = await prisma.googleCalendarCredential.findUnique({
    where: { userId },
    select: { syncLeaseId: true },
  });
  return cred?.syncLeaseId === leaseId;
}

export class GoogleCalendarPushService {
  private async provisionChannel(
    userId: string,
    options: { runInitialSync: boolean },
  ): Promise<{ channelId: string; resourceId: string; expiration: Date }> {
    const { webhookUrl } = getGoogleCalendarWebhookConfig();
    const current = await prisma.googleCalendarCredential.findUnique({
      where: { userId },
      select: {
        channelId: true,
        resourceId: true,
        channelExpiration: true,
        channelTokenEnc: true,
      },
    });
    if (!current) {
      throw new AppError('GOOGLE_CREDENTIAL_NOT_FOUND', 'Credencial nao encontrada.', 404);
    }

    const oldChannel = current.resourceId && current.channelId
      ? { channelId: current.channelId, resourceId: current.resourceId }
      : null;
    const resumablePending = Boolean(
      current.channelId
      && !current.resourceId
      && !current.channelExpiration
      && current.channelTokenEnc,
    );
    const channelId = resumablePending ? current.channelId! : crypto.randomUUID();
    const channelToken = resumablePending
      ? decryptCredential(current.channelTokenEnc!)
      : generateChannelToken();
    const channelTokenHash = hashToken(channelToken);

    if (!resumablePending) {
      await prisma.googleCalendarCredential.update({
        where: { userId },
        data: {
          channelId,
          channelTokenHash,
          channelTokenEnc: encryptCredential(channelToken),
          resourceId: null,
          channelExpiration: null,
          lastMessageNumber: null,
        },
      });
    }

    const client = await getCalendarClient(userId);
    const watchResult = await client.watchEvents(webhookUrl, channelId, channelToken);
    const promoted = await prisma.googleCalendarCredential.updateMany({
      where: { userId, channelId },
      data: {
        resourceId: watchResult.resourceId,
        channelExpiration: watchResult.expiration,
        channelTokenEnc: null,
      },
    });
    if (promoted.count !== 1) {
      throw new AppError(
        'GOOGLE_CHANNEL_STATE_CHANGED',
        'O canal corrente mudou durante a criacao.',
        409,
      );
    }

    if (oldChannel && oldChannel.channelId !== channelId) {
      try {
        await client.stopWatch(oldChannel.channelId, oldChannel.resourceId);
      } catch {
        logger.warn('Canal Google antigo nao pode ser parado apos renovacao', {
          action: 'google-calendar.channel.replace',
          userId,
        });
      }
    }

    if (options.runInitialSync) {
      try {
        await this.initialSync(userId);
      } catch (error) {
        // Forca o cron a refazer o baseline; nunca deixa token antigo mascarar
        // uma conexao cujo full sync nao concluiu.
        await prisma.googleCalendarCredential.updateMany({
          where: { userId, channelId },
          data: { syncToken: null },
        });
        throw error;
      }
    }

    return {
      channelId: watchResult.channelId,
      resourceId: watchResult.resourceId,
      expiration: watchResult.expiration,
    };
  }

  /**
   * Cria canal push e executa sincronizacao inicial.
   *
   * @param userId ID do usuario (professor)
   * @returns Informacoes do canal criado
   */
  async createChannel(userId: string): Promise<{ channelId: string; resourceId: string; expiration: Date }> {
    return this.provisionChannel(userId, { runInitialSync: true });
  }

  /**
   * Para canal push existente.
   *
   * @param userId ID do usuario
   */
  async stopCurrentChannel(userId: string): Promise<void> {
    const cred = await prisma.googleCalendarCredential.findUnique({
      where: { userId },
      select: { channelId: true, resourceId: true },
    });

    if (!cred?.channelId || !cred?.resourceId) {
      return; // Nenhum canal ativo
    }

    const client = await getCalendarClient(userId);

    // O client trata somente 404/410 como sucesso idempotente. Rede, 429 e
    // 5xx continuam como erro e preservam a credencial para retry.
    await client.stopWatch(cred.channelId, cred.resourceId);

    // Limpar campos do canal
    await prisma.googleCalendarCredential.updateMany({
      where: { userId, channelId: cred.channelId },
      data: {
        channelId: null,
        resourceId: null,
        channelExpiration: null,
        channelTokenHash: null,
        channelTokenEnc: null,
        lastMessageNumber: null,
      },
    });
  }

  /** Alias mantido para consumidores anteriores ao item 022. */
  async stopChannel(userId: string): Promise<void> {
    return this.stopCurrentChannel(userId);
  }

  /**
   * Sincronizacao inicial (full sync).
   * Executa sob lease.
   *
   * @param userId ID do usuario
   */
  async initialSync(userId: string): Promise<SyncResult> {
    const leaseId = await acquireLease(userId);
    if (!leaseId) {
      throw new AppError('GOOGLE_SYNC_BUSY', 'Sincronizacao Google ja em andamento.', 503);
    }

    try {
      return await this.initialSyncUnderLease(userId, leaseId);
    } finally {
      if (await isLeaseOwner(userId, leaseId)) {
        await releaseLease(userId, leaseId);
      }
    }
  }

  /**
   * Sincronizacao inicial executando sob lease ja adquirido.
   */
  private async initialSyncUnderLease(
    userId: string,
    leaseId: string,
    notification?: { messageNumber: bigint },
  ): Promise<SyncResult> {
    const syncStartedAt = new Date();
    const timeMin = syncStartedAt;
    const timeMax = new Date(syncStartedAt.getTime() + DEFAULT_TIME_HORIZON_DAYS * 24 * 60 * 60 * 1000);

    const client = await getCalendarClient(userId);
    const { events, nextSyncToken } = await client.fullSync(timeMin, timeMax);

    // Aplicar full snapshot
    const result = await googleCalendarSyncService.applyFullSnapshot(userId, events, syncStartedAt);

    // Persistir estado somente se o lease ainda pertence a esta rodada.
    const persisted = await prisma.googleCalendarCredential.updateMany({
      where: { userId, syncLeaseId: leaseId },
      data: {
        syncToken: nextSyncToken,
        lastSyncAt: syncStartedAt,
        lastMessageNumber: notification?.messageNumber,
      },
    });
    if (persisted.count !== 1) {
      throw new AppError('GOOGLE_SYNC_LEASE_LOST', 'Lease de sincronizacao expirou.', 503);
    }

    return result;
  }

  /**
   * Sincronizacao incremental disparada por notificacao push.
   *
   * @param userId ID do usuario
   * @param notification Dados da notificacao (channelId, messageNumber)
   */
  async incrementalSync(
    userId: string,
    notification?: { channelId: string; messageNumber: bigint },
  ): Promise<SyncResult> {
    // 1. Obter credencial
    const cred = await prisma.googleCalendarCredential.findUnique({
      where: { userId },
      select: {
        syncToken: true,
        channelId: true,
        lastMessageNumber: true,
        syncLeaseId: true,
        syncLeaseExpiresAt: true,
      },
    });

    if (!cred) {
      throw new AppError('GOOGLE_CREDENTIAL_NOT_FOUND', 'Credencial nao encontrada.', 404);
    }

    // 2. Deduplicacao por messageNumber
    if (notification) {
      if (cred.channelId !== notification.channelId) {
        // Notificacao de canal antigo, ignorar
        return {
          eventosProcessados: 0,
          bloqueados: [],
          liberados: [],
          conflitos: [],
        };
      }

      if (cred.lastMessageNumber !== null && notification.messageNumber <= cred.lastMessageNumber) {
        // Duplicata ja processada
        return {
          eventosProcessados: 0,
          bloqueados: [],
          liberados: [],
          conflitos: [],
        };
      }
    }

    // 3. Adquirir lease
    const leaseId = await acquireLease(userId);
    if (!leaseId) {
      throw new AppError('GOOGLE_SYNC_BUSY', 'Sincronizacao Google ja em andamento.', 503);
    }

    try {
      // 4. Executar sincronizacao
      let result: SyncResult;

      if (!cred.syncToken) {
        // Sem syncToken -> full sync
        result = await this.initialSyncUnderLease(userId, leaseId, notification);
      } else {
        try {
          const client = await getCalendarClient(userId);
          const syncStartedAt = new Date();

          const { events, nextSyncToken } = await client.syncIncremental(cred.syncToken);

          result = await googleCalendarSyncService.applyIncrementalChanges(userId, events, syncStartedAt);

          // Persistir novo syncToken, lastSyncAt e messageNumber
          const persisted = await prisma.googleCalendarCredential.updateMany({
            where: { userId, syncLeaseId: leaseId },
            data: {
              syncToken: nextSyncToken,
              lastSyncAt: syncStartedAt,
              lastMessageNumber: notification?.messageNumber,
            },
          });
          if (persisted.count !== 1) {
            throw new AppError('GOOGLE_SYNC_LEASE_LOST', 'Lease de sincronizacao expirou.', 503);
          }
        } catch (err) {
          // 410 GONE -> syncToken expirado, full sync
          if (err instanceof AppError && err.code === 'GOOGLE_SYNC_TOKEN_EXPIRED') {
            // Limpar syncToken antes do full sync
            const cleared = await prisma.googleCalendarCredential.updateMany({
              where: { userId, syncLeaseId: leaseId },
              data: { syncToken: null },
            });
            if (cleared.count !== 1) {
              throw new AppError('GOOGLE_SYNC_LEASE_LOST', 'Lease de sincronizacao expirou.', 503);
            }
            result = await this.initialSyncUnderLease(userId, leaseId, notification);
          } else {
            throw err;
          }
        }
      }

      return result;
    } finally {
      if (await isLeaseOwner(userId, leaseId)) {
        await releaseLease(userId, leaseId);
      }
    }
  }

  /**
   * Renova canal proximo de expirar.
   * Cria novo canal ANTES de parar o antigo.
   *
   * @param userId ID do usuario
   * @returns true se renovado, false se nao precisava
   */
  async renewChannel(userId: string): Promise<boolean> {
    const cred = await prisma.googleCalendarCredential.findUnique({
      where: { userId },
      select: {
        channelId: true,
        resourceId: true,
        channelExpiration: true,
        syncToken: true,
      },
    });

    if (!cred?.channelId || !cred.resourceId || !cred.channelExpiration) {
      logger.warn('Canal Google ausente ou incompleto; renovacao com full sync', {
        action: 'google-calendar.channel.missing',
        userId,
        fullSync: true,
      });
      await this.provisionChannel(userId, { runInitialSync: true });
      return true;
    }

    const now = new Date();
    const hoursUntilExpiration = (cred.channelExpiration.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Renovar se faltar menos de 24 horas
    if (hoursUntilExpiration <= 24) {
      if (hoursUntilExpiration <= 0) {
        logger.warn('Canal Google vencido; notificacoes do intervalo podem ter se perdido', {
          action: 'google-calendar.channel.expired',
          userId,
          fullSync: !cred.syncToken,
        });
      }
      await this.provisionChannel(userId, { runInitialSync: !cred.syncToken });
      return true;
    }

    if (!cred.syncToken) {
      await this.initialSync(userId);
      return true;
    }

    return false;
  }

  /**
   * Trata notificacao de canal inexistente (not_exists).
   * So limpa se channelId ainda for o canal corrente.
   *
   * @param userId ID do usuario
   * @param channelId ID do canal da notificacao
   */
  async handleChannelNotExists(userId: string, channelId: string): Promise<void> {
    await prisma.googleCalendarCredential.updateMany({
      where: {
        userId,
        channelId,
      },
      data: {
        channelId: null,
        resourceId: null,
        channelExpiration: null,
        channelTokenHash: null,
        channelTokenEnc: null,
        lastMessageNumber: null,
      },
    });
  }
}

export const googleCalendarPushService = new GoogleCalendarPushService();
