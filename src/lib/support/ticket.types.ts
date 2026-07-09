/**
 * Tipos de transporte de Support Tickets compartilhados entre as server actions
 * (`actions/support.ts`) e a UI (`components/support/*`, `app/(student)/support`).
 *
 * Vivem fora do arquivo `'use server'` porque módulos de server action só podem
 * exportar funções async; tipos precisam de um módulo neutro para serem
 * importados tanto pelo servidor quanto pelo client sem violar essa regra.
 *
 * O shape espelha `serializeTicket` da rota `/api/v1/support/tickets`.
 */

/** Anexo já sanitizado pelo boundary da API (manifest de auditoria). */
export interface SupportAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Ticket serializado conforme `serializeTicket` da rota de coleção. */
export interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  messageCount: number;
  lastMessage: {
    preview: string;
    authorRole: string;
    createdAt: string;
  } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Página de tickets do aluno (mesmo envelope paginado das sessões). */
export interface PaginatedTickets {
  data: SupportTicket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
