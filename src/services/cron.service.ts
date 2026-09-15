import { prisma } from '@/lib/prisma';
import { getCanonicalTimezone, localTimeToUtc } from '@/lib/canonical-timezone';
import { emailService } from '@/services/email.service';
import { creditService } from '@/services/credit.service';
import {
  creditConsumptionService,
  runSerializableCreditTransaction,
} from '@/lib/credits/credit-consumption.service';
import { EmailType } from '@/lib/constants/enums';
import { SLOT_OCCUPYING_STATUSES } from '@/services/availability.service';
import { hasActiveOverlapWithTx } from '@/services/external-busy.repository';
import type { ReminderSentAt } from '@/types/session.types';
import { logger } from '@/lib/logger';

export interface CronResult {
  expired: number;
  notifiedExpiring7d: number;
  notifiedExpiring30d: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.corgly.com';

// Log da recorrencia sem o erro bruto: `logger.error` serializaria message e
// stack de um terceiro argumento (src/lib/logger.ts), e a message de um erro de
// banco ou de e-mail pode trazer detalhe interno. O contexto leva so o nome do
// erro e um codigo: a message quando ela e um dos codigos que o proprio metodo
// lanca, senao o `code` do erro quando ele tem forma de codigo (P2034,
// ER_LOCK_DEADLOCK, ECONNRESET), senao unknown. O `code` tambem e string livre.
const CODIGOS_DA_RECORRENCIA = new Set([
  'SLOT_GONE',
  'SLOT_BLOCKED',
  'SLOT_TAKEN',
  'EXTERNAL_OCCUPANCY',
  'SLOT_RACE',
  'NO_CREDIT',
]);
const FORMA_DE_CODIGO = /^[A-Z][A-Z0-9_]{0,63}$/;

function contextoDoErroDaRecorrencia(error: unknown): { errorName: string; errorCode: string } {
  const errorName = error instanceof Error ? error.name : 'unknown';
  if (error instanceof Error && CODIGOS_DA_RECORRENCIA.has(error.message)) {
    return { errorName, errorCode: error.message };
  }
  const code = (error as { code?: unknown })?.code;
  const errorCode = typeof code === 'string' && FORMA_DE_CODIGO.test(code) ? code : 'unknown';
  return { errorName, errorCode };
}

export class CronService {
  /**
   * Executa rotina diária de expiração de créditos (03:00 UTC via Vercel Cron).
   *
   * 1. Notifica batches expirando em ≤7 dias (CREDIT_EXPIRY_WARNING urgente)
   * 2. Notifica batches expirando entre 8-30 dias (CREDIT_EXPIRY_WARNING aviso)
   * 3. Loga batches já expirados com saldo restante
   * Idempotência: `lastExpiryEmailSent` impede envio duplicado no mesmo dia.
   */
  async runCreditExpiration(): Promise<CronResult> {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * DAY_MS);
    const in8d = new Date(now.getTime() + 8 * DAY_MS);
    const in30d = new Date(now.getTime() + 30 * DAY_MS);
    const todayStr = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // ── PASSO 1: Notificar expirando em ≤7 dias ────────────────────────────
    const expiring7d = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        totalCredits: number;
        usedCredits: number;
        expiresAt: Date;
        lastExpiryEmailSent: Date | null;
        email: string;
        name: string;
        preferredLanguage: string;
      }>
    >`
      SELECT cb.id, cb.userId, cb.totalCredits, cb.usedCredits, cb.expiresAt,
             cb.lastExpiryEmailSent, u.email, u.name, u.preferredLanguage
      FROM credit_batches cb
      JOIN users u ON u.id = cb.userId
      WHERE cb.expiresAt >= ${now}
        AND cb.expiresAt <= ${in7d}
        AND cb.usedCredits < cb.totalCredits
    `;

    let notifiedExpiring7d = 0;
    for (const batch of expiring7d) {
      // Idempotência: não enviar duplicado no mesmo dia
      if (batch.lastExpiryEmailSent?.toISOString().slice(0, 10) === todayStr) continue;

      const daysLeft = Math.ceil((batch.expiresAt.getTime() - now.getTime()) / DAY_MS);

      await emailService.send({
        to: batch.email,
        type: EmailType.CREDIT_EXPIRY_WARNING,
        data: {
          credits: batch.totalCredits - batch.usedCredits,
          expiresIn: `${daysLeft} dia${daysLeft !== 1 ? 's' : ''}`,
          useLink: `${APP_URL}/dashboard`,
          buyLink: `${APP_URL}/buy`,
        },
        locale: batch.preferredLanguage as Parameters<typeof emailService.send>[0]['locale'],
      });

      await prisma.creditBatch.update({
        where: { id: batch.id },
        data: { lastExpiryEmailSent: now },
      });

      notifiedExpiring7d++;
    }

    // ── PASSO 2: Notificar expirando entre 8-30 dias ────────────────────────
    const expiring30d = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        totalCredits: number;
        usedCredits: number;
        expiresAt: Date;
        lastExpiryEmailSent: Date | null;
        email: string;
        name: string;
        preferredLanguage: string;
      }>
    >`
      SELECT cb.id, cb.userId, cb.totalCredits, cb.usedCredits, cb.expiresAt,
             cb.lastExpiryEmailSent, u.email, u.name, u.preferredLanguage
      FROM credit_batches cb
      JOIN users u ON u.id = cb.userId
      WHERE cb.expiresAt >= ${in8d}
        AND cb.expiresAt <= ${in30d}
        AND cb.usedCredits < cb.totalCredits
    `;

    let notifiedExpiring30d = 0;
    for (const batch of expiring30d) {
      if (batch.lastExpiryEmailSent?.toISOString().slice(0, 10) === todayStr) continue;

      const daysLeft = Math.ceil((batch.expiresAt.getTime() - now.getTime()) / DAY_MS);

      await emailService.send({
        to: batch.email,
        type: EmailType.CREDIT_EXPIRY_WARNING,
        data: {
          credits: batch.totalCredits - batch.usedCredits,
          expiresIn: `${daysLeft} dia${daysLeft !== 1 ? 's' : ''}`,
          useLink: `${APP_URL}/dashboard`,
          buyLink: `${APP_URL}/buy`,
        },
        locale: batch.preferredLanguage as Parameters<typeof emailService.send>[0]['locale'],
      });

      await prisma.creditBatch.update({
        where: { id: batch.id },
        data: { lastExpiryEmailSent: now },
      });

      notifiedExpiring30d++;
    }

    // ── PASSO 3: Detectar e logar batches expirados com saldo ───────────────
    const expiredWithBalance = await prisma.$queryRaw<
      Array<{ id: string; totalCredits: number; usedCredits: number }>
    >`
      SELECT id, totalCredits, usedCredits
      FROM credit_batches
      WHERE expiresAt < ${now}
        AND usedCredits < totalCredits
    `;

    const totalLost = expiredWithBalance.reduce(
      (acc, b) => acc + (Number(b.totalCredits) - Number(b.usedCredits)),
      0,
    );

    if (expiredWithBalance.length > 0) {
      logger.warn('[CronService] credit batches expired with balance', {
        action: 'cron.credit-expiration',
        batchCount: expiredWithBalance.length,
        totalLost,
      });
    }

    return {
      expired: expiredWithBalance.length,
      notifiedExpiring7d,
      notifiedExpiring30d,
    };
  }

  /**
   * Cron: auto-confirmação de sessões encerradas (a cada 15 min).
   * Idempotente: só processa IN_PROGRESS/SCHEDULED com endAt + 15min < NOW().
   * Após confirmar, envia FEEDBACK_AVAILABLE ao aluno (NOTIF-013) fire-and-forget.
   * RESOLVED: CONTRACT-02 gap — FEEDBACK_AVAILABLE email wired
   */
  async runAutoConfirmation(): Promise<{ confirmed: number }> {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const sessionsToConfirm = await prisma.session.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'SCHEDULED'] },
        endAt: { lt: cutoff },
      },
      select: {
        id: true,
        endAt: true,
        student: { select: { email: true, name: true, preferredLanguage: true } },
      },
    });

    const result = await prisma.session.updateMany({
      where: {
        status: { in: ['IN_PROGRESS', 'SCHEDULED'] },
        endAt: { lt: cutoff },
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    for (const session of sessionsToConfirm) {
      emailService
        .send({
          to: session.student.email,
          type: EmailType.FEEDBACK_AVAILABLE,
          data: {
            name: session.student.name,
            sessionDate: session.endAt,
            feedbackUrl: `${APP_URL}/feedback/${session.id}`,
          },
          locale: session.student.preferredLanguage as Parameters<typeof emailService.send>[0]['locale'],
        })
        .catch((e) => logger.error('email.feedback_available.failed', { action: 'email.send', sessionId: session.id }, e));
    }

    return { confirmed: result.count };
  }

  /**
   * Cron: envia reminders de 24h e 1h antes da sessão.
   * Idempotência via campo reminderSentAt (JSON: { "24h": ISO, "1h": ISO }).
   * Deve ser executado a cada 15-30 minutos.
   */
  async runReminders(): Promise<{ sent24h: number; sent1h: number }> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // Sessões SCHEDULED nas próximas 24h+buffer
    const upcomingSessions = await prisma.session.findMany({
      where: {
        status: 'SCHEDULED',
        startAt: { gte: now, lte: in24h },
      },
      include: {
        student: { select: { email: true, preferredLanguage: true, name: true } },
      },
    });

    let sent24h = 0;
    let sent1h = 0;

    for (const session of upcomingSessions) {
      const reminders = (session.reminderSentAt as ReminderSentAt | null) ?? {};
      const timeUntilMs = session.startAt.getTime() - now.getTime();
      const timeUntil1hMs = in1h.getTime() - now.getTime();

      const needs24h = !reminders['24h'] && timeUntilMs <= 24 * 60 * 60 * 1000 + 30 * 60 * 1000;
      const needs1h =
        !reminders['1h'] && timeUntilMs <= 60 * 60 * 1000 + 15 * 60 * 1000 && timeUntil1hMs >= 0;

      const updatedReminders = { ...reminders };

      if (needs24h) {
        try {
          await emailService.send({
            to: session.student.email,
            type: EmailType.BOOKING_REMINDER_24H,
            data: {
              studentName: session.student.name,
              startAt: session.startAt.toISOString(),
              sessionId: session.id,
            },
            locale: session.student.preferredLanguage as Parameters<
              typeof emailService.send
            >[0]['locale'],
          });
          updatedReminders['24h'] = now.toISOString();
          sent24h++;
        } catch (e) {
          logger.error('[CronService.runReminders] 24h reminder error', { action: 'email.send', sessionId: session.id }, e);
        }
      }

      if (needs1h) {
        try {
          await emailService.send({
            to: session.student.email,
            type: EmailType.BOOKING_REMINDER_1H,
            data: {
              studentName: session.student.name,
              startAt: session.startAt.toISOString(),
              sessionId: session.id,
            },
            locale: session.student.preferredLanguage as Parameters<
              typeof emailService.send
            >[0]['locale'],
          });
          updatedReminders['1h'] = now.toISOString();
          sent1h++;
        } catch (e) {
          logger.error('[CronService.runReminders] 1h reminder error', { action: 'email.send', sessionId: session.id }, e);
        }
      }

      if (needs24h || needs1h) {
        await prisma.session.update({
          where: { id: session.id },
          data: { reminderSentAt: updatedReminders },
        });
      }
    }

    return { sent24h, sent1h };
  }

  /**
   * Cron: cria sessões recorrentes para a próxima semana (domingo às 23:00 UTC).
   * Para cada RecurringPattern ativo, tenta criar sessão no próximo slot disponível
   * para o dayOfWeek/startTime especificados.
   */
  async runRecurringBookings(): Promise<{ booked: number; failed: number }> {
    const now = new Date();
    const nextWeekStart = new Date(now.getTime() + 7 * DAY_MS);
    const nextWeekEnd = new Date(nextWeekStart.getTime() + 7 * DAY_MS);

    const patterns = await prisma.recurringPattern.findMany({
      where: { isActive: true },
      include: {
        student: { select: { id: true, email: true, preferredLanguage: true, maxFutureSessions: true } },
      },
    });

    let booked = 0;
    let failed = 0;

    // Fuso canonico da agenda (app_settings), lido UMA vez por execucao: e o
    // mesmo valor que generateSlots usa quando o form nao envia timezone.
    const canonicalTz = await getCanonicalTimezone();

    for (const pattern of patterns) {
      try {
        // Verificar se já existe sessão recorrente para esta semana
        const existing = await prisma.session.findFirst({
          where: {
            studentId: pattern.studentId,
            recurringPatternId: pattern.id,
            startAt: { gte: nextWeekStart, lt: nextWeekEnd },
          },
        });

        if (existing) continue; // já agendada — idempotente

        // Encontrar slot disponível para o dia/hora do padrão
        // Converter "HH:mm" com o MESMO conversor e fuso canonico da geracao
        // de slots (availability.service): paridade de instante UTC entre os
        // dois produtores. O antigo setUTCHours tratava "HH:mm" como UTC e a
        // recorrencia agendava na hora errada em silencio (item 018).
        const targetDate = new Date(nextWeekStart);
        const startDow = nextWeekStart.getUTCDay();
        let daysToAdd = (pattern.dayOfWeek - startDow + 7) % 7;
        if (daysToAdd === 0 && targetDate.getUTCDay() !== pattern.dayOfWeek) daysToAdd = 7;
        targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
        const slotTarget = localTimeToUtc(targetDate, pattern.startTime, canonicalTz);

        // Buscar slot disponível neste horário (tolerância de ±5min)
        const slotFrom = new Date(slotTarget.getTime() - 5 * 60 * 1000);
        const slotTo = new Date(slotTarget.getTime() + 5 * 60 * 1000);

        const slot = await prisma.availabilitySlot.findFirst({
          where: {
            startAt: { gte: slotFrom, lte: slotTo },
            isBlocked: false,
            sessions: { none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } },
          },
        });

        if (!slot) {
          failed++;
          void emailService
            .send({
              to: pattern.student.email,
              type: EmailType.RECURRING_BOOKING_FAILED,
              data: { dayOfWeek: pattern.dayOfWeek, startTime: pattern.startTime },
              locale: pattern.student.preferredLanguage as Parameters<
                typeof emailService.send
              >[0]['locale'],
            })
            .catch((e) =>
              logger.error('[CronService.runRecurringBookings] email error', {
                action: 'email.send',
                patternId: pattern.id,
                ...contextoDoErroDaRecorrencia(e),
              }),
            );
          continue;
        }

        // Verificar créditos
        const balance = await creditService.getBalance(pattern.studentId);
        if (balance < 1) {
          failed++;
          void emailService
            .send({
              to: pattern.student.email,
              type: EmailType.RECURRING_BOOKING_FAILED,
              data: {
                dayOfWeek: pattern.dayOfWeek,
                startTime: pattern.startTime,
                reason: 'insufficient_credits',
              },
              locale: pattern.student.preferredLanguage as Parameters<
                typeof emailService.send
              >[0]['locale'],
            })
            .catch((e) =>
              logger.error('[CronService.runRecurringBookings] email error', {
                action: 'email.send',
                patternId: pattern.id,
                ...contextoDoErroDaRecorrencia(e),
              }),
            );
          continue;
        }

        // CAS + criar sessão na transação
        await runSerializableCreditTransaction(async (tx) => {
          // `startAt`/`endAt` entram no SELECT porque a rechecagem de ocupacao
          // externa logo abaixo precisa da janela da linha TRAVADA, nao da
          // leitura de fora da transacao (`slot`), que ja pode estar stale.
          const slots = await tx.$queryRaw<
            Array<{ id: string; isBlocked: number; version: number; startAt: Date; endAt: Date }>
          >`
            SELECT id, isBlocked, version, startAt, endAt FROM availability_slots WHERE id = ${slot.id} FOR UPDATE
          `;
          const lockedSlot = slots[0];
          if (!lockedSlot) throw new Error('SLOT_GONE');

          // O isBlocked do findFirst de fora da transacao ja pode estar stale: um
          // blockSlot cabe inteiro entre aquela leitura e este lock, e o CAS abaixo
          // compara com a version que o proprio bloqueio incrementou. Rechecar aqui,
          // antes de ocupante, ledger, CAS, credito e create.
          if (lockedSlot.isBlocked) throw new Error('SLOT_BLOCKED');

          // Re-check de ocupacao DENTRO da transacao, sob o FOR UPDATE acima.
          // `availabilitySlotId` deixou de ser unico quando o slot passou a ser
          // devolvido no cancelamento (ver SLOT_OCCUPYING_STATUSES), entao o
          // P2002 do indice UNIQUE nao serve mais de backstop. Sem esta leitura
          // duas execucoes concorrentes criariam duas sessoes vivas no mesmo
          // slot: o filtro `sessions: { none: ... }` do findFirst la em cima
          // roda FORA da transacao e ja pode estar stale aqui.
          const occupant = await tx.session.findFirst({
            where: {
              availabilitySlotId: slot.id,
              status: { in: [...SLOT_OCCUPYING_STATUSES] },
            },
            select: { id: true },
          });
          if (occupant) throw new Error('SLOT_TAKEN');

          // Rechecagem de ocupacao externa (item 024). O `isBlocked: false` do
          // `findFirst` la em cima roda FORA da transacao e nao cobre a janela
          // entre a escrita do ledger e a projecao do bloqueio no slot, que sao
          // transacoes separadas. Sem isto, a recorrencia agenda por cima de
          // horario que o professor ja ocupou no Google.
          if (
            await hasActiveOverlapWithTx(tx, {
              startAt: lockedSlot.startAt,
              endAt: lockedSlot.endAt,
            })
          ) {
            throw new Error('EXTERNAL_OCCUPANCY');
          }

          const cas = await tx.$executeRaw`
            UPDATE availability_slots SET version = version + 1
            WHERE id = ${slot.id} AND version = ${lockedSlot.version}
          `;
          if (cas === 0) throw new Error('SLOT_RACE');

          // Consumir crédito na mesma tx serializável da sessão recorrente.
          const credit = await creditConsumptionService.consumeOrNullWithTx(tx, pattern.studentId, 1);
          if (!credit) throw new Error('NO_CREDIT');

          await tx.session.create({
            data: {
              studentId: pattern.studentId,
              availabilitySlotId: slot.id,
              startAt: slot.startAt,
              endAt: slot.endAt,
              status: 'SCHEDULED',
              isRecurring: true,
              recurringPatternId: pattern.id,
              creditBatchId: credit.batchIds[0] ?? null,
            },
          });
        });

        booked++;
      } catch (e) {
        logger.error('[CronService.runRecurringBookings] pattern error', {
          action: 'cron.recurring',
          patternId: pattern.id,
          ...contextoDoErroDaRecorrencia(e),
        });
        failed++;
      }
    }

    return { booked, failed };
  }

  /**
   * Renova canais push do Google Calendar proximos de expirar.
   * Executado a cada 6 horas via Vercel Cron.
   *
   * Canais expiram em ~7 dias. Renovamos quando faltam < 24 horas.
   *
   * @returns Numero de canais renovados
   */
  async renewGoogleCalendarChannels(): Promise<{ renewed: number; errors: string[] }> {
    const { googleCalendarPushService } = await import('./google-calendar-push.service');

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Buscar canais ausentes, sem baseline ou proximos de expirar.
    const credentials = await prisma.googleCalendarCredential.findMany({
      where: {
        OR: [
          { channelId: null },
          { resourceId: null },
          { channelExpiration: null },
          { syncToken: null },
          { channelExpiration: { lte: in24h } },
        ],
      },
      select: { userId: true },
    });

    let renewed = 0;
    const errors: string[] = [];

    for (const cred of credentials) {
      try {
        const wasRenewed = await googleCalendarPushService.renewChannel(cred.userId);
        if (wasRenewed) {
          renewed++;
        }
      } catch (e) {
        logger.error('[CronService.renewGoogleCalendarChannels] renewal error', { action: 'cron.google-calendar', userId: cred.userId }, e);
        errors.push(cred.userId);
      }
    }

    return { renewed, errors };
  }

  /**
   * Job de reconciliacao periodica do Google Calendar.
   * Executado a cada hora via Vercel Cron.
   *
   * Rede de seguranca para o canal push:
   * - Verifica credenciais com lastSyncAt envelhecido (> 1h)
   * - Dispara sincronizacao completa para credenciais envelhecidas
   * - Registra sucesso/falha no model Job
   * - Emite alarme (log estruturado) quando falha
   *
   * @returns Numero de credenciais reconciliadas e lista de alarmes
   */
  async runGoogleCalendarReconciliation(): Promise<{ reconciled: number; alarms: string[] }> {
    const { googleCalendarPushService } = await import('./google-calendar-push.service');
    const { JobType, JobStatus } = await import('@prisma/client');

    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hora
    const now = new Date();
    const alarms: string[] = [];
    let reconciled = 0;

    // Buscar todas as credenciais conectadas. A reconciliacao e a rede de
    // seguranca inclusive quando o canal push esta ausente ou morto.
    const credentials = await prisma.googleCalendarCredential.findMany({
      select: { userId: true, lastSyncAt: true },
    });

    for (const cred of credentials) {
      const stale = !cred.lastSyncAt ||
        (now.getTime() - cred.lastSyncAt.getTime()) > STALE_THRESHOLD_MS;

      if (!stale) continue;

      // Alarmar carimbo envelhecido
      alarms.push(`user=${cred.userId} lastSync=${cred.lastSyncAt?.toISOString() ?? 'never'}`);
      logger.warn('[CronService.runGoogleCalendarReconciliation] stale sync detected', {
        action: 'cron.google-calendar-reconciliation',
        userId: cred.userId,
        lastSyncAt: cred.lastSyncAt,
      });

      // Criar Job para rastrear
      const job = await prisma.job.create({
        data: {
          type: JobType.GOOGLE_CALENDAR_RECONCILIATION,
          status: JobStatus.RUNNING,
          startedAt: now,
          payload: { userId: cred.userId },
        },
      });

      try {
        // Disparar sincronizacao completa
        // Reutiliza o full sync existente, protegido pelo lease distribuido.
        await googleCalendarPushService.initialSync(cred.userId);

        // Marcar Job como sucedido
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.SUCCEEDED,
            completedAt: new Date(),
          },
        });

        reconciled++;
      } catch (error) {
        // Marcar Job como falho
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.FAILED,
            completedAt: new Date(),
            finalErrorCode: 'RECONCILIATION_FAILED',
            finalErrorMessage: error instanceof Error ? error.message : String(error),
            finalErrorAt: new Date(),
          },
        });

        logger.error('[CronService.runGoogleCalendarReconciliation] reconciliation failed', {
          action: 'cron.google-calendar-reconciliation',
          userId: cred.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { reconciled, alarms };
  }
}

export const cronService = new CronService();
