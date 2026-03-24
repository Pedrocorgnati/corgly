import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { emailService } from '@/services/email.service';
import { creditService } from '@/services/credit.service';
import { EmailType, SupportedLanguage } from '@/types/enums';
import { logger } from '@/lib/logger';
import { SessionStatus } from '@/lib/constants/enums';
import type {
  BookSessionInput,
  CancelSessionInput,
  RescheduleSessionInput,
  BulkCancelInput,
} from '@/schemas/session.schema';
import type {
  SessionWithMeta,
  PaginatedSessions,
  ListSessionsParams,
  BulkCancelResult,
  ReminderSentAt,
} from '@/types/session.types';

const CANCEL_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 horas

function sessionToMeta(s: {
  id: string;
  studentId: string;
  availabilitySlotId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  creditBatchId: string | null;
  isRecurring: boolean;
  recurringPatternId: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  completedAt: Date | null;
  extendedBy: number | null;
  reminderSentAt: unknown;
  rescheduleRequestSlotId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SessionWithMeta {
  return {
    id: s.id,
    studentId: s.studentId,
    availabilitySlotId: s.availabilitySlotId,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    status: s.status as SessionWithMeta['status'],
    creditBatchId: s.creditBatchId,
    isRecurring: s.isRecurring,
    recurringPatternId: s.recurringPatternId,
    cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
    cancelledBy: s.cancelledBy as SessionWithMeta['cancelledBy'],
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    extendedBy: s.extendedBy,
    reminderSentAt: (s.reminderSentAt as ReminderSentAt | null) ?? null,
    rescheduleRequestSlotId: s.rescheduleRequestSlotId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export class SessionService {
  /**
   * Cria uma sessão com transação atômica de 8 passos:
   * 1. Busca slot com FOR UPDATE (lock pessimista)
   * 2. Valida slot disponível (não bloqueado, sem sessão)
   * 3. Valida futuros máximos (maxFutureSessions)
   * 4. CAS otimista: UPDATE version WHERE version = currentVersion
   * 5. Consume crédito FEFO
   * 6. Cria Session
   * 7. Retorna resultado
   * 8. (pós-tx) Envia email fire-and-forget
   */
  async create(studentId: string, data: BookSessionInput): Promise<SessionWithMeta> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { maxFutureSessions: true, preferredLanguage: true, email: true },
    });
    if (!student) throw new AppError('SESSION_001', 'Estudante não encontrado.', 404);

    let session: Awaited<ReturnType<typeof prisma.session.create>> | null = null;
    let creditBatchId: string | null = null;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Passo 1: Lock pessimista no slot
        const slots = await tx.$queryRaw<
          Array<{
            id: string;
            isBlocked: number;
            version: number;
            startAt: Date;
            endAt: Date;
          }>
        >`
          SELECT id, isBlocked, version, startAt, endAt
          FROM availability_slots
          WHERE id = ${data.availabilitySlotId}
          FOR UPDATE
        `;

        const slot = slots[0];
        if (!slot) {
          throw new Error('SLOT_NOT_FOUND');
        }

        // Passo 2: Validar slot disponível
        if (slot.startAt <= new Date()) {
          throw new Error('PAST_SLOT');
        }

        if (slot.isBlocked) {
          throw new Error('SLOT_UNAVAILABLE');
        }

        const existingSession = await tx.session.findUnique({
          where: { availabilitySlotId: data.availabilitySlotId },
          select: { id: true },
        });
        if (existingSession) {
          throw new Error('SLOT_UNAVAILABLE');
        }

        // Passo 3: Verificar limite de sessões futuras
        const futureSessions = await tx.session.count({
          where: {
            studentId,
            status: { in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] },
            startAt: { gt: new Date() },
          },
        });
        if (futureSessions >= student.maxFutureSessions) {
          throw new Error('MAX_FUTURE_SESSIONS');
        }

        // Passo 4: CAS otimista — increment version
        const cas = await tx.$executeRaw`
          UPDATE availability_slots
          SET version = version + 1
          WHERE id = ${data.availabilitySlotId} AND version = ${slot.version}
        `;
        if (cas === 0) {
          throw new Error('SLOT_UNAVAILABLE'); // race condition
        }

        // Passo 5: Consumir crédito FEFO (fora da tx — creditService usa sua própria tx interna)
        // Nota: creditService.consume tem sua própria $transaction com SELECT FOR UPDATE
        // Executamos aqui dentro da tx externa; o Prisma aninha corretamente no MySQL
        const creditResult = await creditService.consume(studentId, 1);
        if (!creditResult) {
          throw new Error('INSUFFICIENT_CREDITS');
        }
        creditBatchId = creditResult.batchIds[0] ?? null;

        // Passo 6: Criar sessão
        const newSession = await tx.session.create({
          data: {
            studentId,
            availabilitySlotId: data.availabilitySlotId,
            startAt: slot.startAt,
            endAt: slot.endAt,
            status: SessionStatus.SCHEDULED,
            creditBatchId,
          },
        });

        return newSession;
      });

      session = result;
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'SLOT_NOT_FOUND') {
          throw new AppError('SESSION_002', 'Slot não encontrado.', 404);
        }
        if (err.message === 'PAST_SLOT') {
          throw new AppError('SESSION_006', 'Não é possível agendar em um horário já passado.', 422);
        }
        if (err.message === 'SLOT_UNAVAILABLE') {
          throw new AppError('SESSION_003', 'SLOT_UNAVAILABLE', 409);
        }
        if (err.message === 'MAX_FUTURE_SESSIONS') {
          throw new AppError('SESSION_004', 'Limite de sessões futuras atingido.', 422);
        }
        if (err.message === 'INSUFFICIENT_CREDITS') {
          throw new AppError('SESSION_005', 'INSUFFICIENT_CREDITS', 402);
        }
      }
      throw err;
    }

    // Passo 8: Email fire-and-forget
    void emailService
      .send({
        to: student.email,
        type: EmailType.BOOKING_CONFIRMED,
        data: {
          sessionId: session.id,
          startAt: session.startAt.toISOString(),
          endAt: session.endAt.toISOString(),
        },
        locale: student.preferredLanguage as SupportedLanguage,
      })
      .catch((e) => logger.error('[SessionService.create] email error', { action: 'email.send' }, e));

    return sessionToMeta(session as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Cancela uma sessão.
   * - Estudante: apenas suas sessões; sem reembolso se < 12h.
   * - Admin: qualquer sessão; sempre reembolsa.
   */
  async cancel(
    sessionId: string,
    userId: string,
    role: string,
    data: CancelSessionInput,
  ): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { student: { select: { preferredLanguage: true, email: true } } },
    });

    if (!session) {
      throw new AppError('SESSION_010', 'Sessão não encontrada.', 404);
    }

    if (role === 'STUDENT' && session.studentId !== userId) {
      throw new AppError('SESSION_011', 'Acesso negado.', 403);
    }

    if (![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)) {
      throw new AppError('SESSION_012', 'Sessão não pode ser cancelada neste estado.', 422);
    }

    const now = Date.now();
    const hoursUntilSession = session.startAt.getTime() - now;
    const isLateCancellation = role === 'STUDENT' && hoursUntilSession < CANCEL_WINDOW_MS;

    const cancelledBy = role === 'ADMIN' ? 'ADMIN' : 'STUDENT';
    const newStatus = role === 'ADMIN' ? 'CANCELLED_BY_ADMIN' : 'CANCELLED_BY_STUDENT';

    // Transação: atualizar sessão + reembolsar crédito se aplicável
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: newStatus,
          cancelledAt: new Date(),
          cancelledBy,
        },
      });

      if (!isLateCancellation && session.creditBatchId) {
        await creditService.refund(session.studentId, 1, session.creditBatchId);
      } else if (role === 'ADMIN' && session.creditBatchId) {
        await creditService.refund(session.studentId, 1, session.creditBatchId);
      }

      return s;
    });

    // Email fire-and-forget
    void emailService
      .send({
        to: session.student.email,
        type: EmailType.BOOKING_CANCELLED,
        data: {
          sessionId: session.id,
          startAt: session.startAt.toISOString(),
          lateCancellation: isLateCancellation,
          cancelledBy,
          reason: data.reason,
        },
        locale: session.student.preferredLanguage as SupportedLanguage,
      })
      .catch((e) => logger.error('[SessionService.cancel] email error', { action: 'email.send' }, e));

    return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Reagendamento de sessão.
   * - ≥12h antes: troca de slot atomicamente.
   * - <12h antes (estudante): status RESCHEDULE_PENDING, persiste novo slot preferido.
   * - Admin: sempre executa diretamente.
   */
  async reschedule(
    sessionId: string,
    userId: string,
    role: string,
    data: RescheduleSessionInput,
  ): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError('SESSION_020', 'Sessão não encontrada.', 404);
    }

    if (role === 'STUDENT' && session.studentId !== userId) {
      throw new AppError('SESSION_021', 'Acesso negado.', 403);
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      throw new AppError('SESSION_022', 'Só é possível reagendar sessões com status SCHEDULED.', 422);
    }

    const now = Date.now();
    const hoursUntilSession = session.startAt.getTime() - now;
    const isLate = role === 'STUDENT' && hoursUntilSession < CANCEL_WINDOW_MS;

    if (isLate) {
      // Registra pedido de reagendamento pendente para aprovação do admin
      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'RESCHEDULE_PENDING',
          rescheduleRequestSlotId: data.newAvailabilitySlotId,
        },
      });
      return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
    }

    // Reagendamento imediato: verificar novo slot e trocar atomicamente
    const updated = await prisma.$transaction(async (tx) => {
      // Lock no novo slot
      const newSlots = await tx.$queryRaw<
        Array<{ id: string; isBlocked: number; version: number; startAt: Date; endAt: Date }>
      >`
        SELECT id, isBlocked, version, startAt, endAt
        FROM availability_slots
        WHERE id = ${data.newAvailabilitySlotId}
        FOR UPDATE
      `;

      const newSlot = newSlots[0];
      if (!newSlot) throw new Error('SLOT_NOT_FOUND');
      if (newSlot.isBlocked) throw new Error('SLOT_UNAVAILABLE');

      const existingOnNewSlot = await tx.session.findUnique({
        where: { availabilitySlotId: data.newAvailabilitySlotId },
        select: { id: true },
      });
      if (existingOnNewSlot) throw new Error('SLOT_UNAVAILABLE');

      // CAS no novo slot
      const cas = await tx.$executeRaw`
        UPDATE availability_slots
        SET version = version + 1
        WHERE id = ${data.newAvailabilitySlotId} AND version = ${newSlot.version}
      `;
      if (cas === 0) throw new Error('SLOT_UNAVAILABLE');

      return tx.session.update({
        where: { id: sessionId },
        data: {
          availabilitySlotId: data.newAvailabilitySlotId,
          startAt: newSlot.startAt,
          endAt: newSlot.endAt,
          rescheduleRequestSlotId: null,
          status: SessionStatus.SCHEDULED,
        },
      });
    });

    return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Admin aprova pedido RESCHEDULE_PENDING.
   * Executa a troca de slot usando rescheduleRequestSlotId armazenado.
   */
  async approveReschedule(sessionId: string): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) {
      throw new AppError('SESSION_030', 'Sessão não encontrada.', 404);
    }
    if (session.status !== 'RESCHEDULE_PENDING') {
      throw new AppError('SESSION_031', 'Sessão não está aguardando aprovação de reagendamento.', 422);
    }
    if (!session.rescheduleRequestSlotId) {
      throw new AppError('SESSION_032', 'Slot de reagendamento não especificado.', 422);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const newSlots = await tx.$queryRaw<
        Array<{ id: string; isBlocked: number; version: number; startAt: Date; endAt: Date }>
      >`
        SELECT id, isBlocked, version, startAt, endAt
        FROM availability_slots
        WHERE id = ${session.rescheduleRequestSlotId}
        FOR UPDATE
      `;

      const newSlot = newSlots[0];
      if (!newSlot) throw new AppError('SESSION_033', 'Slot de destino não encontrado.', 404);
      if (newSlot.isBlocked) throw new AppError('SESSION_034', 'Slot de destino está bloqueado.', 409);

      const existingOnNewSlot = await tx.session.findUnique({
        where: { availabilitySlotId: session.rescheduleRequestSlotId! },
        select: { id: true },
      });
      if (existingOnNewSlot) throw new AppError('SESSION_035', 'Slot de destino já ocupado.', 409);

      const cas = await tx.$executeRaw`
        UPDATE availability_slots
        SET version = version + 1
        WHERE id = ${session.rescheduleRequestSlotId} AND version = ${newSlot.version}
      `;
      if (cas === 0) throw new AppError('SESSION_036', 'Conflito no slot de destino.', 409);

      return tx.session.update({
        where: { id: sessionId },
        data: {
          availabilitySlotId: session.rescheduleRequestSlotId!,
          startAt: newSlot.startAt,
          endAt: newSlot.endAt,
          rescheduleRequestSlotId: null,
          status: SessionStatus.SCHEDULED,
        },
      });
    });

    const meta = sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);

    // Fire-and-forget: notifica o aluno sobre o reagendamento aprovado (ST008)
    prisma.user
      .findUnique({
        where: { id: session.studentId },
        select: { email: true, name: true, preferredLanguage: true },
      })
      .then((student) => {
        if (!student) return;
        return emailService.send({
          to: student.email,
          type: EmailType.BOOKING_RESCHEDULED,
          data: { name: student.name, newStartAt: updated.startAt.toISOString() },
          locale: (student.preferredLanguage as SupportedLanguage) ?? SupportedLanguage.PT_BR,
        });
      })
      .catch((err) => logger.error('[SessionService] BOOKING_RESCHEDULED email failed', { action: 'email.send' }, err));

    return meta;
  }

  /**
   * Admin: cancela todas as sessões SCHEDULED no intervalo de datas.
   * Reembolsa créditos e envia BULK_CANCEL_NOTIFICATION.
   */
  async bulkCancel(data: BulkCancelInput): Promise<BulkCancelResult> {
    const sessions = await prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        startAt: {
          gte: new Date(data.startDate),
          lte: new Date(data.endDate),
        },
      },
      include: {
        student: { select: { email: true, preferredLanguage: true } },
      },
    });

    let cancelled = 0;
    let refunded = 0;
    const errors: BulkCancelResult['errors'] = [];

    for (const session of sessions) {
      try {
        // $transaction atômica por sessão: refund + cancel em mesma transação
        // Se refund falhar, session.update não ocorre (rollback automático)
        await prisma.$transaction(async (tx) => {
          if (session.creditBatchId) {
            await creditService.refundWithTx(tx, session.studentId, 1, session.creditBatchId);
          }

          await tx.session.update({
            where: { id: session.id },
            data: { status: 'CANCELLED_BY_ADMIN', cancelledAt: new Date(), cancelledBy: 'ADMIN' },
          });
        });

        if (session.creditBatchId) refunded++;
        cancelled++;

        void emailService
          .send({
            to: session.student.email,
            type: EmailType.BULK_CANCEL_NOTIFICATION,
            data: {
              sessionId: session.id,
              startAt: session.startAt.toISOString(),
              reason: data.reason,
            },
            locale: session.student.preferredLanguage as SupportedLanguage,
          })
          .catch((e) => logger.error('[SessionService.bulkCancel] email error', { action: 'email.send' }, e));
      } catch (err) {
        errors.push({
          sessionId: session.id,
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    return { cancelled, refunded, errors };
  }

  /**
   * Lista sessões do estudante com paginação e filtro por status.
   */
  async listByStudent(
    studentId: string,
    params: ListSessionsParams = {},
  ): Promise<PaginatedSessions> {
    const { page = 1, limit = 20, status, from, to } = params;
    const skip = (page - 1) * limit;

    const where: Parameters<typeof prisma.session.findMany>[0]['where'] = { studentId };
    if (status) where.status = status as typeof SessionStatus[keyof typeof SessionStatus];
    if (from || to) {
      where.startAt = {};
      if (from) (where.startAt as { gte?: Date }).gte = new Date(from);
      if (to) (where.startAt as { lte?: Date }).lte = new Date(to);
    }

    const [data, total] = await prisma.$transaction([
      prisma.session.findMany({ where, skip, take: limit, orderBy: { startAt: 'desc' } }),
      prisma.session.count({ where }),
    ]);

    return {
      data: data.map((s) => sessionToMeta(s as Parameters<typeof sessionToMeta>[0])),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin: lista todas as sessões com filtros avançados.
   */
  async listAll(params: ListSessionsParams = {}): Promise<PaginatedSessions> {
    const { page = 1, limit = 20, status, from, to } = params;
    const skip = (page - 1) * limit;

    const where: Parameters<typeof prisma.session.findMany>[0]['where'] = {};
    if (status) where.status = status as typeof SessionStatus[keyof typeof SessionStatus];
    if (from || to) {
      where.startAt = {};
      if (from) (where.startAt as { gte?: Date }).gte = new Date(from);
      if (to) (where.startAt as { lte?: Date }).lte = new Date(to);
    }

    const [data, total] = await prisma.$transaction([
      prisma.session.findMany({ where, skip, take: limit, orderBy: { startAt: 'desc' } }),
      prisma.session.count({ where }),
    ]);

    return {
      data: data.map((s) => sessionToMeta(s as Parameters<typeof sessionToMeta>[0])),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retorna uma sessão por ID, validando permissão de acesso.
   */
  async getById(sessionId: string, userId: string, role: string): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError('SESSION_040', 'Sessão não encontrada.', 404);
    }

    if (role === 'STUDENT' && session.studentId !== userId) {
      throw new AppError('SESSION_041', 'Acesso negado.', 403);
    }

    return sessionToMeta(session as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Cron: confirma automaticamente sessões que encerraram mas não foram marcadas COMPLETED.
   * Executa a cada 15 minutos. Idempotente: processa apenas status IN_PROGRESS/SCHEDULED
   * com endAt + 15min < NOW().
   */
  async autoConfirm(): Promise<{ confirmed: number }> {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000); // endAt + 15min já passou

    const result = await prisma.session.updateMany({
      where: {
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.SCHEDULED] },
        endAt: { lt: cutoff },
      },
      data: {
        status: SessionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return { confirmed: result.count };
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle (sala-virtual)
  // ---------------------------------------------------------------------------

  /** Inicia uma sessão (SCHEDULED → IN_PROGRESS). Idempotente se já IN_PROGRESS. */
  async startSession(sessionId: string): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true } });
    if (!session) throw new AppError('SESSION_001', 'Sessão não encontrada.', 404);
    if (![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)) {
      throw new AppError('SESSION_060', 'Sessão não pode ser iniciada neste estado.', 409);
    }
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.IN_PROGRESS },
    });
    return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
  }

  /** Marca sessão como concluída (IN_PROGRESS → COMPLETED). */
  async completeSession(sessionId: string): Promise<SessionWithMeta> {
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.COMPLETED, completedAt: new Date() },
    });
    return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Estende sessão (ADMIN only). Acumula em Session.extendedBy.
   * Limite máximo: 60 minutos acumulados.
   */
  async extendSession(sessionId: string, minutes: number): Promise<SessionWithMeta> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_001', 'Sessão não encontrada.', 404);

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new AppError('SESSION_060', 'Sessão não está em andamento.', 409);
    }

    const currentExtended = session.extendedBy ?? 0;
    if (currentExtended + minutes > 60) {
      throw new AppError('SESSION_070', 'Limite de extensão total de 60 minutos atingido.', 422);
    }

    const newEndAt = new Date(session.endAt.getTime() + minutes * 60 * 1000);
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        endAt: newEndAt,
        extendedBy: currentExtended + minutes,
      },
    });
    return sessionToMeta(updated as Parameters<typeof sessionToMeta>[0]);
  }

  /**
   * Interrompe uma sessão por falha de conexão ou encerramento do professor.
   * Reembolsa 1 crédito ao aluno.
   * Idempotente: segunda chamada retorna 200 sem duplicar reembolso.
   */
  async interruptSession(
    sessionId: string,
    reason: 'connection_lost' | 'teacher_ended',
  ): Promise<{ status: string; creditRefunded: boolean }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        studentId: true,
        creditBatchId: true,
        interruptedAt: true,
      } as Parameters<typeof prisma.session.findUnique>[0]['select'],
    });

    if (!session) throw new AppError('SESSION_001', 'Sessão não encontrada.', 404);

    // Idempotência: já interrompida → retornar 200 sem re-reembolsar
    if (session.status === SessionStatus.INTERRUPTED) {
      return { status: SessionStatus.INTERRUPTED, creditRefunded: false };
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new AppError('SESSION_060', 'Sessão não está em andamento.', 409);
    }

    // Transação: atualizar status + reembolsar crédito
    await prisma.$transaction(async (tx) => {
      await (tx as typeof prisma).session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.INTERRUPTED,
          interruptedAt: new Date(),
        } as Parameters<typeof prisma.session.update>[0]['data'],
      });

      if (session.creditBatchId) {
        await creditService.refund(session.studentId, 1, session.creditBatchId);
      }
    });

    logger.info('session.interrupted', { action: 'session.interrupt', sessionId, reason });

    return { status: SessionStatus.INTERRUPTED, creditRefunded: true };
  }

  // ---------------------------------------------------------------------------
  // No-show handling (P062 / P063)
  // ---------------------------------------------------------------------------

  /**
   * Marks a session as no-show.
   * - 'student': status → NO_SHOW_STUDENT. Crédito NÃO devolvido (aluno faltou).
   * - 'admin':   status → NO_SHOW_ADMIN.   Crédito devolvido ao aluno (professor faltou).
   * Sessão deve estar SCHEDULED ou IN_PROGRESS.
   */
  async markNoShow(sessionId: string, role: 'student' | 'admin'): Promise<{ creditRefunded: boolean }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, studentId: true, creditBatchId: true },
    });

    if (!session) throw new AppError('SESSION_001', 'Sessão não encontrada.', 404);

    if (![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)) {
      throw new AppError('SESSION_030', 'Sessão não pode ser marcada como no-show neste status.', 409);
    }

    const newStatus = role === 'student' ? 'NO_SHOW_STUDENT' : 'NO_SHOW_ADMIN';

    await prisma.session.update({
      where: { id: sessionId },
      data:  { status: newStatus },
    });

    if (role === 'admin' && session.creditBatchId) {
      await creditService.refund(session.studentId, 1, session.creditBatchId);
      return { creditRefunded: true };
    }

    return { creditRefunded: false };
  }

}

export const sessionService = new SessionService();
