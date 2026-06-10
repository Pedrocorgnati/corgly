import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { SessionStatus, UserRole } from '@/lib/constants/enums';
import {
  notesTokenPayloadSchema,
  type NotesTokenPayload,
} from './notes-token.schema';

/**
 * Service do token de notas (T-016, §12.4.1).
 *
 * Emite o JWT curto que `hocuspocus/server.ts` (`onAuthenticate`) já valida,
 * fechando o placeholder de `SessionPageClient` (token = currentUser.id).
 * A regra de autorização aqui é um mirror exato de `onAuthenticate`.
 */

/** TTL curto fixo. O servidor não fixa TTL (valida apenas `exp`); 15m é o canônico desta task. */
export const NOTES_TOKEN_TTL = '15m';

/** Statuses em que a sala (e portanto o caderno) está ativa. Mirror de hocuspocus/server.ts. */
const ACTIVE_SESSION_STATUSES: readonly string[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
];

export interface AuthorizeNotesTokenInput {
  sessionId: string;
  userId: string;
  role: string;
}

export type AuthorizeNotesTokenResult =
  | { ok: true; payload: NotesTokenPayload }
  | { ok: false; status: 403 | 404; reason: string };

/**
 * Espelha `onAuthenticate` de hocuspocus/server.ts: carrega a sessão por id,
 * exige participante (`studentId === userId` OU `role === 'ADMIN'`) e sessão ativa.
 *
 * Não lança: retorna um resultado discriminado para o route mapear status codes
 * (404 sessão ausente, 403 não participante / sessão inativa).
 */
export async function authorizeNotesToken({
  sessionId,
  userId,
  role,
}: AuthorizeNotesTokenInput): Promise<AuthorizeNotesTokenResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  });

  if (!session) {
    return { ok: false, status: 404, reason: 'session_not_found' };
  }

  const isParticipant = session.studentId === userId || role === UserRole.ADMIN;
  if (!isParticipant) {
    return { ok: false, status: 403, reason: 'not_participant' };
  }

  if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return { ok: false, status: 403, reason: 'session_not_active' };
  }

  const payloadRole = role === UserRole.ADMIN ? 'ADMIN' : 'STUDENT';
  return {
    ok: true,
    payload: notesTokenPayloadSchema.parse({ userId, sessionId, role: payloadRole }),
  };
}

/**
 * Assina o JWT curto (HS256, `HOCUSPOCUS_JWT_SECRET`, expiresIn 15m) consumido
 * por hocuspocus/server.ts. Lê `process.env.HOCUSPOCUS_JWT_SECRET` diretamente
 * (mesmo padrão do servidor), não via `@/lib/env`, para não acoplar o boot do
 * service à validação global de env.
 *
 * Lança em caso de secret ausente/curto ou falha de assinatura; o route mapeia
 * para 500 + log `notes_token.error` (Zero Silencio).
 */
export function issueNotesToken(payload: NotesTokenPayload): string {
  const secret = process.env.HOCUSPOCUS_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('HOCUSPOCUS_JWT_SECRET not configured or too short');
  }

  const claims = notesTokenPayloadSchema.parse(payload);
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    expiresIn: NOTES_TOKEN_TTL,
  });
}
