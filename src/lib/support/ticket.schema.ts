import { z } from 'zod';

/**
 * Domínio de Support Tickets (T-049 / suporte do aluno).
 *
 * Espelha os enums Prisma `SupportTicket*` / `SupportAuthorRole` e separa a
 * entrada do aluno (subject, mensagem, anexos) dos campos operacionais
 * preenchidos pelo servidor (status, authorRole, userId).
 *
 * O contrato de anexos (`attachmentDescriptorSchema` + `sanitizeFilename`) vive
 * aqui, e não na rota, porque é compartilhado entre a criação do ticket (rota
 * de coleção, este pacote) e a rota de mensagens (`[id]/messages`, T-067 /
 * execute-task). Centralizar evita drift de limite de tamanho e de regra de
 * sanitização entre os dois pontos de entrada.
 */

export const SUPPORT_TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const SUPPORT_AUTHOR_ROLES = ['STUDENT', 'ADMIN', 'SYSTEM'] as const;

/** Limite de tamanho por anexo (10 MiB) - validado no boundary da API. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Teto de anexos por mensagem - evita payloads abusivos. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
/** Allowlist de MIME aceitos em anexos de suporte (imagens + PDF + texto). */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const;

/**
 * Sanitiza o nome de arquivo de um anexo antes de persistir/exibir:
 *   - descarta qualquer componente de diretório (anti path-traversal);
 *   - troca caracteres fora de `[A-Za-z0-9._-]` por `_`;
 *   - colapsa pontos repetidos (impede `..` e extensões duplas ofuscadas);
 *   - trunca em 255 chars (limite de `Asset.originalFilename`).
 *
 * Nunca confia no `filename` cru vindo do cliente: o valor sanitizado é o único
 * que segue para storage, manifest de auditoria e resposta.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.replace(/^.*[\\/]/, '');
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '');
  const safe = cleaned.length > 0 ? cleaned : 'arquivo';
  return safe.slice(0, 255);
}

/**
 * Descritor de anexo aceito no boundary da API. O cliente envia metadados
 * (nome, MIME, tamanho) do arquivo já carregado no storage; o binário em si é
 * resolvido pela camada de upload (Asset). A validação aqui garante anexo
 * sanitizado + limite de tamanho (acceptance da T-049) antes de qualquer
 * persistência.
 */
export const attachmentDescriptorSchema = z
  .object({
    filename: z.string().trim().min(1, 'Nome de arquivo obrigatório.').max(255),
    mimeType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES, {
      error: 'Tipo de anexo não suportado.',
    }),
    sizeBytes: z
      .number({ error: 'Tamanho do anexo inválido.' })
      .int('Tamanho do anexo inválido.')
      .positive('Tamanho do anexo inválido.')
      .max(MAX_ATTACHMENT_BYTES, 'Anexo excede o limite de 10 MiB.'),
    storageKey: z.string().trim().min(1).max(500).optional(),
  })
  .transform((descriptor) => ({
    ...descriptor,
    filename: sanitizeFilename(descriptor.filename),
  }));

export type AttachmentDescriptor = z.infer<typeof attachmentDescriptorSchema>;

/**
 * Criação de ticket pelo aluno: assunto + prioridade opcional + corpo da
 * primeira mensagem + anexos opcionais. `userId`, `status` e `authorRole` são
 * sempre derivados do servidor (nunca aceitos do cliente) para impedir
 * escalonamento e quebra de proveniência.
 */
export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Assunto muito curto.').max(200, 'Assunto muito longo.'),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('NORMAL'),
  message: z.string().trim().min(1, 'Mensagem obrigatória.').max(10_000, 'Mensagem muito longa.'),
  sessionId: z.string().uuid('sessionId inválido.').optional(),
  attachments: z
    .array(attachmentDescriptorSchema)
    .max(MAX_ATTACHMENTS_PER_MESSAGE, `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`)
    .optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/**
 * Resposta do aluno num ticket existente: corpo da mensagem + anexos opcionais
 * (mesmo contrato sanitizado da criação). `authorRole`/`authorId` são sempre
 * derivados do servidor; o cliente nunca escolhe em nome de quem responde.
 * Centraliza limite/sanitização com `createTicketSchema` via os mesmos building
 * blocks (`attachmentDescriptorSchema`, `MAX_ATTACHMENTS_PER_MESSAGE`).
 */
export const addMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem obrigatória.').max(10_000, 'Mensagem muito longa.'),
  attachments: z
    .array(attachmentDescriptorSchema)
    .max(MAX_ATTACHMENTS_PER_MESSAGE, `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`)
    .optional(),
});

export type AddMessageInput = z.infer<typeof addMessageSchema>;

/** Paginação da thread de mensagens de um ticket do próprio aluno. */
export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

/** Filtros de listagem dos tickets do próprio aluno (paginado). */
export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
