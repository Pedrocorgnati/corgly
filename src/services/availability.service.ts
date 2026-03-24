import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import type { GenerateSlotsInput } from '@/schemas/availability.schema';

const SESSION_DURATION_MINUTES = 50;

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
   * Retorna slots disponíveis (não bloqueados, sem sessão associada) a partir de uma data.
   * @param date ISO date string "YYYY-MM-DD" — retorna slots dos próximos 7 dias a partir desta data
   */
  async getAvailable(date: string): Promise<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      isBlocked: boolean;
    }>
  > {
    const from = new Date(`${date}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        startAt: { gte: from, lt: to },
        isBlocked: false,
        sessions: { none: {} },
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

    if (slotsToCreate.length === 0) {
      return { created: 0, skipped: 0 };
    }

    // Buscar slots já existentes para calcular skipped
    const existingStartAts = await prisma.$queryRaw<Array<{ startAt: Date }>>`
      SELECT startAt FROM availability_slots
      WHERE startAt IN (${slotsToCreate.map((s) => s.startAt)})
    `;
    const existingSet = new Set(existingStartAts.map((r) => r.startAt.getTime()));

    const newSlots = slotsToCreate.filter((s) => !existingSet.has(s.startAt.getTime()));

    if (newSlots.length > 0) {
      await prisma.availabilitySlot.createMany({
        data: newSlots,
        skipDuplicates: true,
      });
    }

    return {
      created: newSlots.length,
      skipped: slotsToCreate.length - newSlots.length,
    };
  }

  /**
   * Bloqueia um slot (impede reservas).
   * Não permite bloquear slot com sessão SCHEDULED ou IN_PROGRESS.
   */
  async blockSlot(slotId: string): Promise<void> {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      include: {
        sessions: {
          where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
          select: { id: true },
        },
      },
    });

    if (!slot) {
      throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
    }
    if (slot.isBlocked) {
      throw new AppError('AVAILABILITY_050', 'Slot já está bloqueado.', 409);
    }
    if (slot.sessions.length > 0) {
      throw new AppError(
        'AVAILABILITY_051',
        'Não é possível bloquear slot com sessão ativa.',
        409,
      );
    }

    await prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { isBlocked: true },
    });
  }

  /**
   * Desbloqueia um slot.
   */
  async unblockSlot(slotId: string): Promise<void> {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId },
    });

    if (!slot) {
      throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
    }
    if (!slot.isBlocked) {
      throw new AppError('AVAILABILITY_052', 'Slot já está desbloqueado.', 409);
    }

    await prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { isBlocked: false },
    });
  }

  /**
   * Deleta um slot vazio (sem sessão associada).
   * ADMIN only — validar na rota.
   */
  async deleteEmpty(slotId: string): Promise<void> {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      include: {
        sessions: { select: { id: true }, take: 1 },
      },
    });

    if (!slot) {
      throw new AppError('AVAILABILITY_001', 'Slot não encontrado.', 404);
    }

    if (slot.sessions.length > 0) {
      throw new AppError(
        'AVAILABILITY_060',
        'Não é possível deletar slot com sessão associada.',
        409,
      );
    }

    await prisma.availabilitySlot.delete({
      where: { id: slotId },
    });
  }
}

export const availabilityService = new AvailabilityService();
