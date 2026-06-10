import { z } from 'zod';

/**
 * Domínio de suporte (§12.4.4) — schemas Zod para tickets e mensagens.
 * Espelha os enums Prisma SupportTicketStatus / SupportTicketPriority / SupportAuthorRole.
 */

export const SUPPORT_TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const SUPPORT_AUTHOR_ROLES = ['STUDENT', 'ADMIN', 'SYSTEM'] as const;

export const supportTicketStatusSchema = z.enum(SUPPORT_TICKET_STATUSES);
export const supportTicketPrioritySchema = z.enum(SUPPORT_TICKET_PRIORITIES);
export const supportAuthorRoleSchema = z.enum(SUPPORT_AUTHOR_ROLES);

/** Criação de ticket pelo aluno (ou em nome dele). Inclui a primeira mensagem. */
export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Assunto muito curto').max(200, 'Assunto excede 200 caracteres'),
  priority: supportTicketPrioritySchema.default('NORMAL'),
  sessionId: z.string().uuid('sessionId inválido').optional(),
  message: z.string().trim().min(1, 'Mensagem obrigatória').max(5000, 'Mensagem excede 5000 caracteres'),
});

/** Nova mensagem em um ticket existente. */
export const createSupportMessageSchema = z.object({
  ticketId: z.string().uuid('ticketId inválido'),
  body: z.string().trim().min(1, 'Mensagem obrigatória').max(5000, 'Mensagem excede 5000 caracteres'),
  authorRole: supportAuthorRoleSchema,
  isInternal: z.boolean().default(false),
});

/** Mudança de status do ticket (ação admin). resolvedAt é derivado no service. */
export const updateSupportTicketStatusSchema = z.object({
  ticketId: z.string().uuid('ticketId inválido'),
  status: supportTicketStatusSchema,
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type CreateSupportMessageInput = z.infer<typeof createSupportMessageSchema>;
export type UpdateSupportTicketStatusInput = z.infer<typeof updateSupportTicketStatusSchema>;
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;
export type SupportTicketPriority = z.infer<typeof supportTicketPrioritySchema>;
export type SupportAuthorRole = z.infer<typeof supportAuthorRoleSchema>;
