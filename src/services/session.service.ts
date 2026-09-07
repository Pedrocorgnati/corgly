import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { emailService } from '@/services/email.service';
import { creditService } from '@/services/credit.service';
import {
  creditConsumptionService,
  runSerializableCreditTransaction,
} from '@/lib/credits/credit-consumption.service';
import { EmailType, SupportedLanguage } from '@/types/enums';
import { logger } from '@/lib/logger';
import { SessionStatus } from '@/lib/constants/enums';
import { SLOT_OCCUPYING_STATUSES } from '@/services/availability.service';
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
  BulkCancelPreview,
  ReminderSentAt,
} from '@/types/session.types';

const CANCEL_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 horas

/**
 * `where` do Prisma para Session. Extraido dos proprios tipos gerados: o
 * argumento de `findMany` e opcional, por isso os dois `NonNullable` (indexar
 * `Parameters<...>[0]['where']` direto nao compila).
 */
type SessionWhereInput = NonNullable<
  NonNullable<Parameters<typeof prisma.session.findMany>[0]>['where']
>;

/**
 * Estados em que a aula ainda esta "viva" (pode ser cancelada, iniciada ou
 * marcada como no-show). Anotado como `SessionStatus[]` porque um literal cru
 * seria inferido como `('SCHEDULED' | 'IN_PROGRESS')[]` e `includes` recusaria
 * qualquer outro status vindo do banco.
 */
const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
];

/**
 * Ordenacoes aceitas pela listagem de sessoes.
 *
 * Vocabulario FECHADO de proposito: `sort` chega como texto livre da querystring
 * (GET /api/v1/sessions) e nada fora desta lista pode virar `orderBy` do Prisma.
 *
 * O default continua `startAt:desc` (historico primeiro) — comportamento de
 * /history e do painel admin desde sempre. Quem precisa da PROXIMA aula pede
 * `startAt:asc` explicitamente (consumidor: `getDashboardNextSession` em
 * src/actions/dashboard.ts, que combina `sort=startAt:asc` + `from=<agora>` +
 * `limit=1`). Antes disto o parametro era emitido e ignorado, e o `limit=1`
 * devolvia a aula futura mais distante em vez da mais proxima.
 */
export const SESSION_SORTS = ['startAt:asc', 'startAt:desc'] as const;

export type SessionSort = (typeof SESSION_SORTS)[number];

export const DEFAULT_SESSION_SORT: SessionSort = 'startAt:desc';

/**
 * Traduz a querystring em ordenacao conhecida.
 * Devolve `undefined` para ausente OU nao reconhecido — quem chama decide se
 * cai no default ou recusa a requisicao (a rota recusa: ordenar errado em
 * silencio foi exatamente a causa do bug da "proxima aula").
 */
export function parseSessionSort(raw: string | null | undefined): SessionSort | undefined {
  if (!raw) return undefined;
  return (SESSION_SORTS as readonly string[]).includes(raw) ? (raw as SessionSort) : undefined;
}

/**
 * Parametros de listagem + ordenacao.
 * `ListSessionsParams` e contrato cross-module (src/types/session.types.ts) e
 * segue intocado; `sort` e opcional e local a este servico.
 */
export type ListSessionsParamsWithSort = ListSessionsParams & { sort?: SessionSort };

/**
 * Filtros exclusivos do console admin (`GET /api/v1/admin/sessions`).
 * `hasFeedback` fica fora de `ListSessionsParamsWithSort` porque nem
 * `listByStudent` nem `listAll` expoem esse filtro; so `listAllForAdmin`.
 */
export type ListAdminSessionsParams = ListSessionsParamsWithSort & { hasFeedback?: boolean };

/**
 * Linha da LISTAGEM DO CONSOLE ADMIN (`GET /api/v1/admin/sessions`).
 *
 * E `SessionWithMeta` mais os dois campos que a tabela do admin promete nas
 * colunas "Aluno" e "Score". Eles NAO entram em `SessionWithMeta` (contrato de
 * `GET /api/v1/sessions`, consumido tambem pelo aluno) porque o aluno nao
 * precisa do proprio nome repetido em cada linha nem da nota agregada aqui — ele
 * tem /progress. Quem produz: `listAllForAdmin`, unico ponto que pede as
 * relacoes `student` e `feedback` ao Prisma.
 */
export interface AdminSessionRow extends SessionWithMeta {
  /**
   * Nome do aluno. Nunca vazio: `Session.student` e relacao OBRIGATORIA no
   * schema (prisma/schema.prisma) e a consulta sempre pede `select: { name }`.
   */
  studentName: string;
  /**
   * Media das 4 dimensoes canonicas do model Feedback (listening, speaking,
   * writing, vocabulary), escala 0-5 com 1 casa decimal — mesma convencao de
   * `averageScore` em `GET /api/v1/admin/users/[id]`.
   *
   * `null` significa UMA coisa so: a aula ainda nao tem feedback registrado.
   * Nao e "dado indisponivel" — o filtro `hasFeedback=false` lista exatamente
   * essas aulas.
   */
  score: number | null;
}

export interface PaginatedAdminSessions {
  data: AdminSessionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function orderByFromSort(sort: SessionSort): { startAt: 'asc' | 'desc' } {
  return { startAt: sort === 'startAt:asc' ? 'asc' : 'desc' };
}

/**
 * ISO -> Date para os filtros `from`/`to`. Devolve `null` (com log) quando o
 * texto nao parseia: um `Invalid Date` dentro de `where.startAt` faz o Prisma
 * estourar e a rota devolver 500 sem dizer o motivo. A rota ja recusa lixo com
 * 400; isto e a segunda barreira para os outros chamadores (cron/admin).
 */
function toRangeDate(raw: string | undefined, field: 'from' | 'to'): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    logger.warn('[SessionService] filtro de data ignorado', { action: 'list.range', field, raw });
    return null;
  }
  return parsed;
}

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

/** Linha do Prisma aceita por `sessionToMeta` (base da serializacao). */
type SessionRecord = Parameters<typeof sessionToMeta>[0];

/** As 4 dimensoes canonicas do model Feedback, como o Prisma as devolve. */
type FeedbackScoresRecord = {
  listeningScore: number;
  speakingScore: number;
  writingScore: number;
  vocabularyScore: number;
};

/**
 * Media das 4 dimensoes canonicas, 1 casa decimal.
 *
 * `null` quando a aula ainda nao tem feedback — e o unico motivo de ausencia,
 * porque as 4 notas sao colunas NOT NULL do model Feedback (schema.prisma) e o
 * schema de submissao (src/schemas/feedback.schema.ts) exige inteiro 1-5 nas
 * quatro. Convencao de arredondamento identica a de `GET /api/v1/admin/users/[id]`.
 */
function averageFeedbackScore(feedback: FeedbackScoresRecord | null): number | null {
  if (!feedback) return null;
  const soma =
    feedback.listeningScore +
    feedback.speakingScore +
    feedback.writingScore +
    feedback.vocabularyScore;
  return Math.round((soma / 4) * 10) / 10;
}

/**
 * Serializa a linha do console admin. Exige as relacoes `student` e `feedback`
 * na consulta: sem elas o TypeScript recusa a chamada, que e o que impede a
 * tabela do admin de voltar a mostrar traco em toda a coluna "Aluno".
 */
function sessionToAdminRow(
  s: SessionRecord & {
    student: { name: string };
    feedback: FeedbackScoresRecord | null;
  },
): AdminSessionRow {
  return {
    ...sessionToMeta(s),
    studentName: s.student.name,
    score: averageFeedbackScore(s.feedback),
  };
}

/**
 * Monta o `where` compartilhado pelas tres listagens (aluno, generica e admin).
 * `studentId` chega so na do aluno; `hasFeedback`, so na do admin.
 */
function buildSessionWhere(params: {
  studentId?: string;
  status?: ListSessionsParams['status'];
  from?: string;
  to?: string;
  hasFeedback?: boolean;
}): SessionWhereInput {
  const where: SessionWhereInput = {};
  if (params.studentId) where.studentId = params.studentId;
  if (params.status) where.status = params.status as typeof SessionStatus[keyof typeof SessionStatus];
  // `feedback` e relacao 1-1 opcional: `isNot: null` traz so as sessoes ja
  // avaliadas e `is: null` so as pendentes de avaliacao.
  if (params.hasFeedback !== undefined) {
    where.feedback = params.hasFeedback ? { isNot: null } : { is: null };
  }
  const gte = toRangeDate(params.from, 'from');
  const lte = toRangeDate(params.to, 'to');
  if (gte || lte) {
    const range: { gte?: Date; lte?: Date } = {};
    if (gte) range.gte = gte;
    if (lte) range.lte = lte;
    where.startAt = range;
  }
  return where;
}

/**
 * Janela inclusiva em UTC do bulk cancel. `new Date('2026-04-30')` resolve para
 * 2026-04-30T00:00:00.000Z, entao um `lte` cru cortaria o ultimo dia inteiro.
 * Referencia UTC igual a de AvailabilityService.getAvailable (linhas 101-102);
 * escolher o fuso do produto e o item 018.
 *
 * Helper de modulo de proposito: `bulkCancel` e `bulkCancelPreview` precisam da
 * MESMA janela. Duas copias da regra divergem no dia em que uma muda, e a previa
 * volta a mentir sem ninguem perceber.
 */
export function bulkCancelWindow(
  startDate: string,
  endDate: string,
): { windowStart: Date; windowEnd: Date } {
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const windowStart = DATE_ONLY.test(startDate)
    ? new Date(`${startDate}T00:00:00.000Z`)
    : new Date(startDate);
  const windowEnd = DATE_ONLY.test(endDate)
    ? new Date(`${endDate}T23:59:59.999Z`)
    : new Date(endDate);
  return { windowStart, windowEnd };
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
      const result = await runSerializableCreditTransaction(async (tx) => {
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

        // `findFirst` e nao `findUnique`: `availabilitySlotId` deixou de ser unico
        // quando o slot passou a ser devolvido no cancelamento. Um slot pode
        // carregar N sessoes canceladas (historico) e no maximo uma ocupante.
        const existingSession = await tx.session.findFirst({
          where: {
            availabilitySlotId: data.availabilitySlotId,
            status: { in: [...SLOT_OCCUPYING_STATUSES] },
          },
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

        // Passo 5: Consumir crédito FEFO na mesma tx serializável da sessão.
        const creditResult = await creditConsumptionService.consumeOrNullWithTx(tx, studentId, 1);
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

    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
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

      const existingOnNewSlot = await tx.session.findFirst({
        where: {
          availabilitySlotId: data.newAvailabilitySlotId,
          status: { in: [...SLOT_OCCUPYING_STATUSES] },
        },
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

      const existingOnNewSlot = await tx.session.findFirst({
        where: {
          availabilitySlotId: session.rescheduleRequestSlotId!,
          status: { in: [...SLOT_OCCUPYING_STATUSES] },
        },
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
    const { windowStart, windowEnd } = bulkCancelWindow(data.startDate, data.endDate);

    const sessions = await prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        startAt: {
          gte: windowStart,
          lte: windowEnd,
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

    // Efeito real do bloqueio em massa: apos cancelar, os slots livres da janela
    // ficam bloqueados numa unica escrita agregada. `sessions: { none: ... }` preserva
    // o invariante que AvailabilityService.blockSlot defende com AVAILABILITY_051
    // (slot ocupado nunca vira bloqueado). O bump de `version` e obrigatorio: o
    // CronService decide por CAS nesse campo. Fica fora do $transaction por sessao
    // de proposito — cancelar e bloquear sao unidades de falha distintas.
    const blockedResult = await prisma.availabilitySlot.updateMany({
      where: {
        startAt: { gte: windowStart, lte: windowEnd },
        isBlocked: false,
        sessions: { none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } },
      },
      data: { isBlocked: true, version: { increment: 1 } },
    });

    return { cancelled, refunded, blocked: blockedResult.count, errors };
  }

  /**
   * Admin: previa do bulk cancel. Conta, sem escrever nada, quantas sessoes
   * seriam canceladas e quantos slots seriam bloqueados na mesma janela.
   *
   * Os predicados sao os MESMOS da execucao: `status: SCHEDULED` + janela para
   * sessoes (igual ao `findMany` de `bulkCancel`), `isBlocked: false` +
   * `sessions: { none: ... }` para slots (igual ao `updateMany`). E o limite
   * superior de `cancelled`: a execucao pode cancelar menos se alguma sessao
   * cair em `errors`.
   */
  async bulkCancelPreview(data: {
    startDate: string;
    endDate: string;
  }): Promise<BulkCancelPreview> {
    const { windowStart, windowEnd } = bulkCancelWindow(data.startDate, data.endDate);

    const [sessionsToCancel, slotsToBlock] = await prisma.$transaction([
      prisma.session.count({
        where: {
          status: SessionStatus.SCHEDULED,
          startAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      }),
      prisma.availabilitySlot.count({
        where: {
          startAt: { gte: windowStart, lte: windowEnd },
          isBlocked: false,
          sessions: { none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } },
        },
      }),
    ]);

    return { sessionsToCancel, slotsToBlock };
  }

  /**
   * Lista sessões do estudante com paginação, filtro por status/janela e ordenação.
   *
   * `from`/`to` filtram por `startAt` (>= / <=) e `sort` escolhe a ordem — default
   * `startAt:desc`. A combinação `status=SCHEDULED` + `from=<agora>` +
   * `sort=startAt:asc` + `limit=1` é o que devolve a PRÓXIMA aula do aluno.
   */
  async listByStudent(
    studentId: string,
    params: ListSessionsParamsWithSort = {},
  ): Promise<PaginatedSessions> {
    const { page = 1, limit = 20, status, from, to, sort = DEFAULT_SESSION_SORT } = params;
    const skip = (page - 1) * limit;

    const where = buildSessionWhere({ studentId, status, from, to });

    const [data, total] = await prisma.$transaction([
      prisma.session.findMany({ where, skip, take: limit, orderBy: orderByFromSort(sort) }),
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
   * Lista todas as sessões da plataforma no contrato `SessionWithMeta`.
   *
   * Consumidor: o ramo ADMIN de `GET /api/v1/sessions` — a listagem GENERICA,
   * que responde o mesmo shape para aluno e admin. Quem precisa das colunas do
   * console (nome do aluno, nota) chama `listAllForAdmin`, nao esta.
   *
   * Mesmo contrato de `from`/`to`/`sort` do `listByStudent` (default `startAt:desc`).
   */
  async listAll(params: ListSessionsParamsWithSort = {}): Promise<PaginatedSessions> {
    const { page = 1, limit = 20, status, from, to, sort = DEFAULT_SESSION_SORT } = params;
    const skip = (page - 1) * limit;

    const where = buildSessionWhere({ status, from, to });

    const [data, total] = await prisma.$transaction([
      prisma.session.findMany({ where, skip, take: limit, orderBy: orderByFromSort(sort) }),
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
   * Console admin: lista todas as sessões com o que a TABELA do admin mostra.
   *
   * Diferenca em relacao a `listAll` — e a razao de existir:
   *  - pede as relacoes `student` (nome) e `feedback` (as 4 notas) ao Prisma e
   *    devolve `studentName` + `score` por linha. Sem isso as colunas "Aluno" e
   *    "Score" caiam no placeholder em TODAS as linhas, e o admin abria a tela
   *    sem saber de quem era a aula;
   *  - aceita o filtro `hasFeedback` (aulas ja avaliadas / pendentes de
   *    avaliacao), que a listagem generica nao expoe.
   *
   * Consumidor unico: `GET /api/v1/admin/sessions`.
   */
  async listAllForAdmin(params: ListAdminSessionsParams = {}): Promise<PaginatedAdminSessions> {
    const {
      page = 1,
      limit = 20,
      status,
      from,
      to,
      hasFeedback,
      sort = DEFAULT_SESSION_SORT,
    } = params;
    const skip = (page - 1) * limit;

    const where = buildSessionWhere({ status, from, to, hasFeedback });

    const [data, total] = await prisma.$transaction([
      prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: orderByFromSort(sort),
        include: {
          student: { select: { name: true } },
          // So as 4 dimensoes canonicas: o resto do Feedback (notas
          // qualitativas, privateNote) e detalhe, nao coluna de listagem.
          feedback: {
            select: {
              listeningScore: true,
              speakingScore: true,
              writingScore: true,
              vocabularyScore: true,
            },
          },
        },
      }),
      prisma.session.count({ where }),
    ]);

    return {
      // Sem cast de propósito: e o `include` acima que satisfaz o parametro de
      // `sessionToAdminRow`. Remover a relacao `student` da consulta vira erro
      // de compilacao, nao coluna vazia em producao.
      data: data.map((s) => sessionToAdminRow(s)),
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
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
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

    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
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
