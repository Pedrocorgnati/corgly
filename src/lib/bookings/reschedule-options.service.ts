import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { availabilityService } from '@/services/availability.service';
import { SessionStatus } from '@/lib/constants/enums';

/**
 * Janela livre de reagendamento (ST-09): com >= 12h de antecedência o estudante
 * reagenda direto; abaixo disso o pedido vira RESCHEDULE_PENDING (aprovação do
 * professor). Espelha `CANCEL_WINDOW_MS` de `session.service.ts` — fonte única
 * da regra de negócio é o serviço de reagendamento; aqui apenas a expomos.
 */
export const RESCHEDULE_FREE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Teto de alternativas retornadas para não inundar a UI. */
const MAX_OPTIONS = 20;

/** Timezone default quando o usuário não tem um IANA válido persistido. */
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type ReschedulePenaltyType = 'NONE' | 'ADMIN_APPROVAL';

export interface ReschedulePolicyWindow {
  /** Tamanho da janela livre em horas (12). */
  free_window_hours: number;
  /** Instante limite (ISO UTC) para reagendar sem aprovação: startAt - 12h. */
  deadline: string;
  /** Horas até o início da sessão original (1 casa decimal; negativo se passou). */
  hours_until_session: number;
  /** true quando o reagendamento ainda cai na janela livre (sem penalidade). */
  within_free_window: boolean;
}

export interface ReschedulePenalty {
  type: ReschedulePenaltyType;
  /** true quando o reagendamento exige aprovação do professor. */
  requires_approval: boolean;
  /** Motivo legível da penalidade (null quando NONE). */
  reason: string | null;
}

export interface RescheduleOptionSlot {
  availability_slot_id: string;
  /** Início do slot alternativo (ISO UTC). A UI converte para o tz do aluno. */
  start_at: string;
  /** Fim do slot alternativo (ISO UTC). */
  end_at: string;
}

export interface RescheduleOptionsResult {
  session: {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
  };
  /** IANA timezone do aluno dono da sessão — a UI formata os slots nele. */
  student_timezone: string;
  policy_window: ReschedulePolicyWindow;
  penalty: ReschedulePenalty;
  /** Slots alternativos disponíveis (vazio quando não há horários livres). */
  options: RescheduleOptionSlot[];
}

/**
 * Calcula as alternativas padronizadas de reagendamento de uma sessão (ST-09).
 *
 * `bookingId` resolve para `Session.id` (a plataforma é single-tutor; não há
 * entidade Booking separada — a sessão é a unidade reservável). A autorização e
 * as transições válidas espelham `sessionService.reschedule`: somente o dono
 * (ou ADMIN) acessa, e só sessões SCHEDULED podem ser reagendadas.
 */
export class RescheduleOptionsService {
  async getOptions(
    sessionId: string,
    userId: string,
    role: string,
  ): Promise<RescheduleOptionsResult> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) {
      throw new AppError('SESSION_020', 'Sessão não encontrada.', 404);
    }

    if (role === 'STUDENT' && session.studentId !== userId) {
      throw new AppError('SESSION_021', 'Acesso negado.', 403);
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      throw new AppError(
        'SESSION_022',
        'Só é possível reagendar sessões com status SCHEDULED.',
        422,
      );
    }

    const student = await prisma.user.findUnique({
      where: { id: session.studentId },
      select: { timezone: true },
    });
    const studentTimezone = student?.timezone ?? DEFAULT_TIMEZONE;

    const now = Date.now();
    const startMs = session.startAt.getTime();
    const hoursUntilSession = (startMs - now) / (60 * 60 * 1000);
    // ADMIN reagenda direto em qualquer janela; STUDENT só dentro da janela livre.
    const withinFreeWindow =
      role !== 'STUDENT' || startMs - now >= RESCHEDULE_FREE_WINDOW_MS;

    const freeWindowHours = RESCHEDULE_FREE_WINDOW_MS / (60 * 60 * 1000);
    const policy_window: ReschedulePolicyWindow = {
      free_window_hours: freeWindowHours,
      deadline: new Date(startMs - RESCHEDULE_FREE_WINDOW_MS).toISOString(),
      hours_until_session: Math.round(hoursUntilSession * 10) / 10,
      within_free_window: withinFreeWindow,
    };

    const penalty: ReschedulePenalty = withinFreeWindow
      ? { type: 'NONE', requires_approval: false, reason: null }
      : {
          type: 'ADMIN_APPROVAL',
          requires_approval: true,
          reason: `Reagendamento com menos de ${freeWindowHours}h de antecedência exige aprovação do professor.`,
        };

    // Alternativas: slots livres a partir de hoje (serviço canônico, janela de 7
    // dias), excluindo o slot atual da sessão e quaisquer horários já passados.
    const fromKey = new Date(now).toISOString().slice(0, 10);
    const available = await availabilityService.getAvailable(fromKey);
    const options: RescheduleOptionSlot[] = available
      .filter((s) => s.id !== session.availabilitySlotId)
      .filter((s) => new Date(s.startAt).getTime() > now)
      .slice(0, MAX_OPTIONS)
      .map((s) => ({
        availability_slot_id: s.id,
        start_at: s.startAt,
        end_at: s.endAt,
      }));

    return {
      session: {
        id: session.id,
        start_at: session.startAt.toISOString(),
        end_at: session.endAt.toISOString(),
        status: session.status,
      },
      student_timezone: studentTimezone,
      policy_window,
      penalty,
      options,
    };
  }
}

export const rescheduleOptionsService = new RescheduleOptionsService();
