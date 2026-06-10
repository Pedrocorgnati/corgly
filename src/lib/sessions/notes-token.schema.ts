import { z } from 'zod';

/**
 * Domínio do token de notas (caderno colaborativo Hocuspocus, §12.4.1).
 *
 * O payload aqui DEVE espelhar `HocuspocusAuthPayload` (src/types/sala-virtual.ts)
 * porque é exatamente o claim-set que `hocuspocus/server.ts` (`onAuthenticate`)
 * valida via `jwt.verify`. Qualquer divergência quebra a autenticação do servidor.
 */

export const NOTES_TOKEN_ROLES = ['STUDENT', 'ADMIN'] as const;
export type NotesTokenRole = (typeof NOTES_TOKEN_ROLES)[number];

/** Claims assinados no JWT curto consumido pelo servidor Hocuspocus. */
export const notesTokenPayloadSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(NOTES_TOKEN_ROLES),
});

export type NotesTokenPayload = z.infer<typeof notesTokenPayloadSchema>;

/** Shape da resposta do endpoint `POST /api/v1/sessions/:id/notes/token`. */
export const notesTokenResponseSchema = z.object({
  token: z.string().min(1),
});

export type NotesTokenResponse = z.infer<typeof notesTokenResponseSchema>;
