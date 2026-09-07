import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { SessionStatus } from '@/lib/constants/enums';
import type { GenerateSlotsInput } from '@/schemas/availability.schema';

const SESSION_DURATION_MINUTES = 50;

/**
 * Status em que uma `Session` ainda OCUPA o `AvailabilitySlot`.
 *
 * Lista POSITIVA de proposito (fail-closed). So os dois cancelamentos
 * (`CANCELLED_BY_STUDENT`, `CANCELLED_BY_ADMIN`) devolvem o horario ao pool;
 * qualquer outro estado — inclusive um status novo que venha a ser adicionado ao
 * enum — mantem o slot ocupado ate alguem decidir o contrario explicitamente.
 * Uma lista negativa (`notIn: [cancelados]`) faria o oposto: status futuro
 * liberaria o slot em silencio e permitiria dupla reserva.
 *
 * Desde a remocao do `@unique` de `Session.availabilitySlotId`, esta constante e
 * a definicao operacional de "slot ocupado" em toda a base. O banco nao garante
 * mais no-maximo-uma-sessao-viva-por-slot; quem garante e esta lista somada a
 * transacao SERIALIZABLE com `SELECT ... FOR UPDATE` no slot e CAS em
 * `availability_slots.version` (ver `SessionService.create`).
 */
export const SLOT_OCCUPYING_STATUSES: readonly SessionStatus[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
  SessionStatus.COMPLETED,
  SessionStatus.NO_SHOW_STUDENT,
  SessionStatus.NO_SHOW_ADMIN,
  SessionStatus.INTERRUPTED,
  SessionStatus.RESCHEDULE_PENDING,
];

/** Converte "HH:mm" + Date (UTC midnight) + timezone offset → UTC Date */
function localTimeToUtc(date: Date, timeHHmm: string, ianaTimezone: string): Date {
  const [hours, minutes] = timeHHmm.split(':').map(Number);

  // Construir string ISO local sem offset e usar Intl para calcular offset real
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  // Usa Intl.DateTimeFormat para descobrir o offset do timezone na data/hora dada
  const localIso = `${year}-${month}-${day}T${hh}:${mm}:00`;
  const probe = new Date(`${localIso}Z`); // Trata como UTC temporariamente

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(probe);
  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

  const tzYear = getPart('year');
  const tzMonth = getPart('month') - 1;
  const tzDay = getPart('day');
  const tzHour = getPart('hour') % 24; // hora12:false pode retornar 24 para meia-noite
  const tzMinute = getPart('minute');
  const tzSecond = getPart('second');

  // Offset = UTC epoch da probe - epoch local interpretado como UTC
  const localAsUtcMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = probe.getTime() - localAsUtcMs;

  // Hora local desejada → UTC
  const desiredLocalMs = Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0);
  return new Date(desiredLocalMs + offsetMs);
}

/** Retorna a data UTC correspondente ao início do dia (00:00 UTC) para N dias a partir de hoje */
function utcDatePlusDays(daysFromNow: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d;
}

export class AvailabilityService {
  /**
   * Retorna slots disponíveis (não bloqueados, sem sessão associada) na janela recebida.
   * @param from ISO date string "YYYY-MM-DD" — início da janela (inclusivo)
   * @param untilExclusive ISO date string "YYYY-MM-DD" — limite superior exclusivo da janela
   */
  async getAvailable(from: string, untilExclusive: string): Promise<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      isBlocked: boolean;
    }>
  > {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const untilDate = new Date(`${untilExclusive}T00:00:00.000Z`);

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        startAt: { gte: fromDate, lt: untilDate },
        isBlocked: false,
        sessions: { none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } },
      },
      orderBy: { startAt: 'asc' },
    });

    return slots.map((s) => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      isBlocked: s.isBlocked,
    }));
  }

  /**
   * Retorna TODOS os slots da janela com visão de admin: inclui bloqueados e
   * vendidos, com a sessão ocupante quando existir.
   *
   * Deliberadamente NÃO aplica os dois filtros de `getAvailable`
   * (`isBlocked: false` e `sessions: { none: ... }`): o painel do professor
   * precisa justamente do que aquele método remove — sem isso a cor por status
   * do calendário e o botão de desbloquear do editor ficam sem dado.
   *
   * @param from ISO date string "YYYY-MM-DD" — início da janela (inclusivo)
   * @param untilExclusive ISO date string "YYYY-MM-DD" — limite superior exclusivo
   */
  async listForAdmin(from: string, untilExclusive: string): Promise<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      isBlocked: boolean;
      session: { id: string; status: string; studentName?: string } | null;
    }>
  > {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const untilDate = new Date(`${untilExclusive}T00:00:00.000Z`);

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        startAt: { gte: fromDate, lt: untilDate },
      },
      include: {
        sessions: {
          where: { status: { in: [...SLOT_OCCUPYING_STATUSES] } },
          select: {
            id: true,
            status: true,
            student: { select: { name: true } },
          },
        },
      },
      orderBy: { startAt: 'asc' },
    });

    return slots.map((s) => {
      const occupying = s.sessions[0];

      return {
        id: s.id,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        isBlocked: s.isBlocked,
        session: occupying
          ? {
              id: occupying.id,
              status: occupying.status,
              studentName: occupying.student?.name ?? undefined,
            }
          : null,
      };
    });
  }

  /**
   * Gera slots de disponibilidade para as próximas N semanas.
   * Slots existentes (por startAt) são ignorados (upsert semântica: skip duplicates).
   * ADMIN only — validar na rota.
   */
  async generateSlots(
    data: GenerateSlotsInput,
  ): Promise<{ created: number; skipped: number }> {
    const { days, ranges, weeksAhead, timezone } = data;
    const tz = timezone ?? 'America/Sao_Paulo';

    const slotsToCreate: Array<{ startAt: Date; endAt: Date }> = [];

    for (let week = 0; week < weeksAhead; week++) {
      for (const dayOfWeek of days) {
        // Calcular quantos dias até o próximo dayOfWeek a partir de hoje
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        const todayDow = todayUtc.getUTCDay();
        let daysUntil = (dayOfWeek - todayDow + 7) % 7;
        if (week > 0 && daysUntil === 0) daysUntil = 0; // manter no mesmo dia p/ semanas seguintes
        const targetDate = utcDatePlusDays(daysUntil + week * 7);

        for (const range of ranges) {
          // Gera slots de SESSION_DURATION_MINUTES entre range.start e range.end
          const rangeStart = localTimeToUtc(targetDate, range.start, tz);
          const rangeEnd = localTimeToUtc(targetDate, range.end, tz);

          let cursor = rangeStart.getTime();
          while (cursor + SESSION_DURATION_MINUTES * 60 * 1000 <= rangeEnd.getTime()) {
            slotsToCreate.push({
              startAt: new Date(cursor),
              endAt: new Date(cursor + SESSION_DURATION_MINUTES * 60 * 1000),
            });
            cursor += SESSION_DURATION_MINUTES * 60 * 1000;
          }
        }
      }
    }

    // Nenhum slot gerado significa que TODAS as faixas de todos os dias pedidos sao
    // estreitas demais para uma aula (ou invertidas): `GenerateSlotsSchema` valida o
    // formato `HH:mm`, nao a ordem nem a largura. Devolver `{ created: 0, skipped: 0 }`
    // aqui pintava esse pedido impossivel de verde: o editor cai no ramo `else` de
    // `AvailabilityEditor.onSubmit` e mostra `toast.success('0 horário(s) criado(s).')`.
    // Distinto de `created === 0` apos a deduplicacao, que e sucesso legitimo (os
    // horarios ja existiam) e continua respondendo 201.
    if (slotsToCreate.length === 0) {
      throw new AppError(
        'AVAILABILITY_070',
        `Nenhum horário de ${SESSION_DURATION_MINUTES} minutos cabe nas faixas informadas.`,
        400,
      );
    }

    // O GenerateSlotsSchema aceita `days` com o mesmo dia repetido e `ranges`
    // iguais ou sobrepostos, entao o mesmo `startAt` pode aparecer mais de uma
    // vez no lote. Reduzir aqui, preservando a ordem de geracao e o primeiro
    // `endAt`, porque `startAt` e @unique no banco e `skipDuplicates` engoliria
    // a colisao em silencio, inflando o `created` devolvido ao professor.
    const totalPedido = slotsToCreate.length;
    const porStartAt = new Map<number, { startAt: Date; endAt: Date }>();
    for (const slot of slotsToCreate) {
      const chave = slot.startAt.getTime();
      if (!porStartAt.has(chave)) {
        porStartAt.set(chave, slot);
      }
    }
    const slotsUnicos = Array.from(porStartAt.values());

    // Buscar slots já existentes para calcular skipped.
    // Não usar $queryRaw com `IN (${array})`: o template tag do Prisma envia o array
    // como UM parâmetro e o MySQL responde "Arrays are not supported in MySQL",
    // derrubando todo POST /api/v1/availability em 500. O filtro `in` do query builder
    // expande a lista corretamente.
    const existingStartAts = await prisma.availabilitySlot.findMany({
      where: { startAt: { in: slotsUnicos.map((s) => s.startAt) } },
      select: { startAt: true },
    });
    const existingSet = new Set(existingStartAts.map((r) => r.startAt.getTime()));

    const newSlots = slotsUnicos.filter((s) => !existingSet.has(s.startAt.getTime()));

    // `created` e o numero de linhas que o banco realmente gravou, nao o tamanho
    // do lote enviado. `skipped` agora soma tres origens: duplicata dentro do
    // pedido, horario ja existente no banco e colisao absorvida pelo
    // `skipDuplicates`. Invariante: created + skipped === totalPedido.
    let created = 0;
    if (newSlots.length > 0) {
      const inserted = await prisma.availabilitySlot.createMany({
        data: newSlots,
        skipDuplicates: true,
      });
      created = inserted.count;
    }

    return {
      created,
      skipped: totalPedido - created,
    };
  }

  /**
   * Bloqueia um slot (impede reservas).
   * Não permite bloquear slot com sessão SCHEDULED ou IN_PROGRESS.
   *
   * Leitura e escrita acontecem dentro de uma única transação: o slot é lido com
   * `SELECT ... FOR UPDATE` e os três guards rodam sob esse lock, fechando a janela em
   * que outro escritor (o job recorrente do CronService, por exemplo) criava sessão
   * entre a checagem de ocupação e a gravação de `isBlocked`.
   *
   * O `UPDATE` grava `isBlocked` e incrementa `version` na mesma instrução, guardado por
   * `AND version = <version lido sob o lock>` — mesma forma de `SessionService.reschedule`,
   * e simetria com o caminho agregado de `SessionService.bulkCancel`, que já bumpa `version`.
   * Enquanto o `FOR UPDATE` é mantido até o commit, nenhuma outra transação escreve nesta
   * linha entre a leitura e o `UPDATE`: quem faz o segundo escritor perder é o lock somado à
   * re-execução dos guards. O `cas === 0` é assert fail-closed, para o caso de um refactor
   * futuro tirar a leitura de dentro do lock.
   */
  async blockSlot(slotId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; isBlocked: number; version: number }>
      >`
        SELECT id, isBlocked, version
        FROM availability_slots
        WHERE id = ${slotId}
        FOR UPDATE
      `;

      const slot = rows[0];
      if (!slot) {
        throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
      }
      if (slot.isBlocked) {
        throw new AppError('AVAILABILITY_050', 'Slot já está bloqueado.', 409);
      }

      // Re-check de ocupação DENTRO da transação, sob o FOR UPDATE acima.
      // Mantém os dois status literais do contrato atual da rota — alinhar com
      // SLOT_OCCUPYING_STATUSES (7 status) mudaria a resposta HTTP e é decisão de produto.
      const ocupante = await tx.session.findFirst({
        where: {
          availabilitySlotId: slotId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });
      if (ocupante) {
        throw new AppError(
          'AVAILABILITY_051',
          'Não é possível bloquear slot com sessão ativa.',
          409,
        );
      }

      const cas = await tx.$executeRaw`
        UPDATE availability_slots
        SET isBlocked = true, version = version + 1
        WHERE id = ${slotId} AND version = ${slot.version}
      `;
      if (cas === 0) {
        throw new AppError(
          'AVAILABILITY_053',
          'Conflito de concorrência no slot. Tente novamente.',
          409,
        );
      }
    });
  }

  /**
   * Desbloqueia um slot.
   *
   * Mesma estrutura de `blockSlot`: `SELECT ... FOR UPDATE`, guard sob o lock e escrita por
   * CAS que incrementa `version`. Não há guard de ocupante aqui — desbloquear slot com sessão
   * viva não cria dupla reserva.
   */
  async unblockSlot(slotId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; isBlocked: number; version: number }>
      >`
        SELECT id, isBlocked, version
        FROM availability_slots
        WHERE id = ${slotId}
        FOR UPDATE
      `;

      const slot = rows[0];
      if (!slot) {
        throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
      }
      if (!slot.isBlocked) {
        throw new AppError('AVAILABILITY_052', 'Slot já está desbloqueado.', 409);
      }

      const cas = await tx.$executeRaw`
        UPDATE availability_slots
        SET isBlocked = false, version = version + 1
        WHERE id = ${slotId} AND version = ${slot.version}
      `;
      if (cas === 0) {
        throw new AppError(
          'AVAILABILITY_053',
          'Conflito de concorrência no slot. Tente novamente.',
          409,
        );
      }
    });
  }

  /**
   * Deleta um slot vazio (sem sessão associada).
   * ADMIN only — validar na rota.
   *
   * Dois guards distintos desde a devolução de slot cancelado:
   *  - sessão OCUPANTE (`SLOT_OCCUPYING_STATUSES`) → 409 AVAILABILITY_060, o caso
   *    de negócio ("tem aula marcada aqui");
   *  - sessão apenas HISTÓRICA (cancelada) → 409 AVAILABILITY_061. A linha
   *    cancelada continua apontando para o slot pela FK
   *    `sessions_availabilitySlotId_fkey` (sem `onDelete`, portanto Restrict),
   *    então o DELETE quebraria com erro de FK cru. Antes da mudança este caso não
   *    existia: qualquer sessão, viva ou cancelada, já barrava no primeiro guard.
   */
  async deleteEmpty(slotId: string): Promise<void> {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      include: {
        sessions: { select: { id: true, status: true } },
      },
    });

    if (!slot) {
      throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
    }

    const occupying = slot.sessions.filter((session) =>
      SLOT_OCCUPYING_STATUSES.includes(session.status),
    );

    if (occupying.length > 0) {
      throw new AppError(
        'AVAILABILITY_060',
        'Não é possível deletar slot com sessão associada.',
        409,
      );
    }

    if (slot.sessions.length > 0) {
      throw new AppError(
        'AVAILABILITY_061',
        'Não é possível deletar slot com histórico de sessões canceladas.',
        409,
      );
    }

    await prisma.availabilitySlot.delete({
      where: { id: slotId },
    });
  }
}

export const availabilityService = new AvailabilityService();
