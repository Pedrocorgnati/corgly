import { z } from 'zod';
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from '@/lib/support/ticket.schema';

/**
 * Contratos da visão ADMINISTRATIVA de Support Tickets (T-051 / AD-39, AD-15).
 *
 * A visão do aluno (per-titular, IDOR-safe) vive em `ticket.schema.ts`. Aqui
 * ficam os contratos cross-aluno consumidos só pelas rotas `/api/v1/admin/*`
 * (guardadas por `requireAdmin`): filtro de caixa de entrada, mudança de status
 * e a mensagem do admin (resposta visível OU nota interna `isInternal`).
 *
 * Notas internas NÃO são um modelo separado: são `SupportMessage` com
 * `isInternal: true` e `authorRole: ADMIN` (mesma decisão de modelagem do
 * schema Prisma). "Separada da thread" é uma garantia de apresentação: a thread
 * do aluno nunca serializa mensagens internas (ver rota do aluno), e a UI admin
 * as renderiza em um painel distinto.
 */

/** Ações de mudança de status permitidas ao admin. */
export const ADMIN_TICKET_ACTIONS = ['RESOLVE', 'CLOSE', 'REOPEN'] as const;
export type AdminTicketAction = (typeof ADMIN_TICKET_ACTIONS)[number];

/** Mapa ação -> status resultante (Zero Estados Indefinidos: total e explícito). */
export const ADMIN_TICKET_ACTION_TO_STATUS: Record<
  AdminTicketAction,
  (typeof SUPPORT_TICKET_STATUSES)[number]
> = {
  RESOLVE: 'RESOLVED',
  CLOSE: 'CLOSED',
  REOPEN: 'OPEN',
};

/**
 * Filtro da caixa de entrada admin: status, prioridade, aluno e data.
 * Datas são `YYYY-MM-DD` (inclusivas no boundary). Coerções deixam a query
 * string crua passar direto de `searchParams`.
 */
export const adminTicketsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
    /** Filtra por aluno: id (uuid) OU busca textual por nome/e-mail. */
    studentId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(120).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida.').optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida.').optional(),
  })
  // Intervalo coerente: dateFrom não pode ser posterior a dateTo (senão a
  // listagem volta vazia sem explicar o porquê - Zero Estados Indefinidos).
  .refine(({ dateFrom, dateTo }) => !(dateFrom && dateTo && dateFrom > dateTo), {
    message: 'Data inicial não pode ser posterior à final.',
    path: ['dateTo'],
  });
export type AdminTicketsQuery = z.infer<typeof adminTicketsQuerySchema>;

/** Mudança de status do ticket pelo admin. */
export const adminTicketActionSchema = z.object({
  action: z.enum(ADMIN_TICKET_ACTIONS),
});

/**
 * Mensagem do admin no ticket. `isInternal=false` => resposta visível ao aluno;
 * `isInternal=true` => nota interna (nunca chega ao aluno).
 */
export const adminTicketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem obrigatória.').max(10_000, 'Mensagem muito longa.'),
  isInternal: z.boolean().default(false),
});
export type AdminTicketMessageInput = z.infer<typeof adminTicketMessageSchema>;

/* ------------------------------------------------------------------ */
/* Tipos de transporte (serialização das rotas admin)                  */
/* ------------------------------------------------------------------ */

/** Resumo de aluno embutido no ticket admin. */
export interface AdminTicketStudent {
  id: string;
  name: string;
  email: string;
}

/** Ticket serializado na caixa de entrada admin (cross-aluno). */
export interface AdminTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  student: AdminTicketStudent | null;
  messageCount: number;
  /** Quantidade de notas internas (isInternal): sinaliza contexto operacional. */
  internalNoteCount: number;
  lastMessage: {
    preview: string;
    authorRole: string;
    isInternal: boolean;
    createdAt: string;
  } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Envelope paginado da caixa de entrada admin. */
export interface PaginatedAdminTickets {
  data: AdminTicket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Mensagem (resposta OU nota interna) na visão admin de um ticket. */
export interface AdminTicketMessage {
  id: string;
  body: string;
  authorRole: string;
  authorId: string | null;
  isInternal: boolean;
  createdAt: string;
}

/** Detalhe completo de um ticket na visão admin (thread + notas internas). */
export interface AdminTicketDetail extends AdminTicket {
  messages: AdminTicketMessage[];
}

/** Nota interna agregada na página de notas do aluno (cross-ticket). */
export interface StudentInternalNote {
  id: string;
  ticketId: string;
  ticketSubject: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

/** Resposta da página de notas do aluno: o aluno + suas notas + tickets abertos. */
export interface StudentNotesPayload {
  student: AdminTicketStudent;
  notes: StudentInternalNote[];
  /** Tickets do aluno disponíveis para anexar uma nova nota interna. */
  openTickets: { id: string; subject: string; status: string }[];
}
