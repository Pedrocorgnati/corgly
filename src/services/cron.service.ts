import { prisma } from '@/lib/prisma';
import { emailService } from '@/services/email.service';
import { creditService } from '@/services/credit.service';
import { EmailType } from '@/lib/constants/enums';
import type { ReminderSentAt } from '@/types/session.types';
import { logger } from '@/lib/logger';

export interface CronResult {
  expired: number;
  notifiedExpiring7d: number;
  notifiedExpiring30d: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.corgly.com';

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
        const [hours, minutes] = pattern.startTime.split(':').map(Number);

        // Calcular data alvo na próxima semana para o dayOfWeek
        const targetDate = new Date(nextWeekStart);
        const startDow = nextWeekStart.getUTCDay();
        let daysToAdd = (pattern.dayOfWeek - startDow + 7) % 7;
        if (daysToAdd === 0 && targetDate.getUTCDay() !== pattern.dayOfWeek) daysToAdd = 7;
        targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
        targetDate.setUTCHours(hours, minutes, 0, 0);

        // Buscar slot disponível neste horário (tolerância de ±5min)
        const slotFrom = new Date(targetDate.getTime() - 5 * 60 * 1000);
        const slotTo = new Date(targetDate.getTime() + 5 * 60 * 1000);

        const slot = await prisma.availabilitySlot.findFirst({
          where: {
            startAt: { gte: slotFrom, lte: slotTo },
            isBlocked: false,
            sessions: { none: {} },
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
              logger.error('[CronService.runRecurringBookings] email error', { action: 'email.send', patternId: pattern.id }, e),
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
              logger.error('[CronService.runRecurringBookings] email error', { action: 'email.send', patternId: pattern.id }, e),
            );
          continue;
        }

        // CAS + criar sessão na transação
        await prisma.$transaction(async (tx) => {
          const slots = await tx.$queryRaw<Array<{ id: string; version: number }>>`
            SELECT id, version FROM availability_slots WHERE id = ${slot.id} FOR UPDATE
          `;
          const lockedSlot = slots[0];
          if (!lockedSlot) throw new Error('SLOT_GONE');

          const cas = await tx.$executeRaw`
            UPDATE availability_slots SET version = version + 1
            WHERE id = ${slot.id} AND version = ${lockedSlot.version}
          `;
          if (cas === 0) throw new Error('SLOT_RACE');

          // Consumir crédito
          const credit = await creditService.consume(pattern.studentId, 1);
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
        logger.error('[CronService.runRecurringBookings] pattern error', { action: 'cron.recurring', patternId: pattern.id }, e);
        failed++;
      }
    }

    return { booked, failed };
  }
}

export const cronService = new CronService();
