import { z } from 'zod';

/**
 * Domínio do token de entrada dedicado da sessão (T-025, §12.3).
 *
 * Este token NÃO substitui a autenticação principal (JWT_SECRET, resolvido via
 * middleware -> headers x-user-id / x-user-role). É um segundo fator de curta
 * duração, escopado a UMA sessão, emitido apenas dentro da janela de acesso e
 * assinado com um secret dedicado (`SESSION_ENTRY_TOKEN_SECRET`), distinto do
 * secret do token principal e do token do caderno (HOCUSPOCUS_JWT_SECRET).
 *
 * O claim `purpose: 'session-entry'` torna explícito o escopo do token e impede
 * que ele seja confundido/reutilizado como token de autenticação principal.
 */

export const SESSION_ENTRY_TOKEN_PURPOSE = 'session-entry' as const;

export const SESSION_ENTRY_TOKEN_ROLES = ['STUDENT', 'ADMIN'] as const;
export type SessionEntryTokenRole = (typeof SESSION_ENTRY_TOKEN_ROLES)[number];

/** Claims assinados no JWT curto de entrada da sessão. */
export const sessionEntryTokenPayloadSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(SESSION_ENTRY_TOKEN_ROLES),
  purpose: z.literal(SESSION_ENTRY_TOKEN_PURPOSE),
});

export type SessionEntryTokenPayload = z.infer<
  typeof sessionEntryTokenPayloadSchema
>;

/** Shape da resposta do endpoint `POST /api/v1/sessions/:id/entry-token`. */
export const sessionEntryTokenResponseSchema = z.object({
  token: z.string().min(1),
  /** Segundos até a expiração do token (curto, por design). */
  expiresIn: z.number().int().positive(),
  /** Instante de expiração em ISO 8601 (UTC). */
  expiresAt: z.string().datetime(),
});

export type SessionEntryTokenResponse = z.infer<
  typeof sessionEntryTokenResponseSchema
>;
