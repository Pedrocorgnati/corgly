import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { SessionStatus, UserRole } from '@/lib/constants/enums';
import {
  sessionEntryTokenPayloadSchema,
  SESSION_ENTRY_TOKEN_PURPOSE,
  type SessionEntryTokenPayload,
} from './session-entry-token.schema';

/**
 * Service do token de entrada dedicado da sessão (T-025, §12.3).
 *
 * Regra de autorização (todas validadas, Zero Fluxos Incompletos):
 *   1. Sessão existe (senão 404).
 *   2. Papel/participação: studentId === userId OU role === ADMIN (professor),
 *      senão 403 not_participant.
 *   3. Status da sessão ativo (SCHEDULED ou IN_PROGRESS), senão 403
 *      session_not_active.
 *   4. Janela de acesso: o instante atual está entre (startAt - LEAD) e
 *      (endAt + GRACE), senão 403 outside_access_window. Cobre o caso
 *      "antes da janela".
 *
 * O token é curto (`SESSION_ENTRY_TOKEN_TTL`) e assinado com secret dedicado
 * (`SESSION_ENTRY_TOKEN_SECRET`), NÃO substituindo a auth principal.
 */

/** TTL curto fixo (5m). Por design o token de entrada expira rapidamente. */
export const SESSION_ENTRY_TOKEN_TTL = '5m';
/** Mesmo valor em segundos, exposto na resposta (expiresIn). */
export const SESSION_ENTRY_TOKEN_TTL_SECONDS = 5 * 60;

/** Antecedência com que a janela de acesso abre antes de startAt (10m). */
export const ENTRY_WINDOW_LEAD_MS = 10 * 60 * 1000;
/** Tolerância com que a janela de acesso fecha após endAt (5m). */
export const ENTRY_WINDOW_GRACE_MS = 5 * 60 * 1000;

/** Statuses em que a sala da sessão está ativa. */
const ACTIVE_SESSION_STATUSES: readonly string[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
];

export interface AuthorizeSessionEntryTokenInput {
  sessionId: string;
  userId: string;
  role: string;
  /** Instante de referência; injetável para testabilidade. Default: agora. */
  now?: Date;
}

export type AuthorizeSessionEntryTokenResult =
  | { ok: true; payload: SessionEntryTokenPayload }
  | { ok: false; status: 403 | 404; reason: string };

/**
 * Valida participação, status e janela de acesso. Não lança: retorna resultado
 * discriminado para o route mapear status codes (404 ausente, 403 demais).
 */
export async function authorizeSessionEntryToken({
  sessionId,
  userId,
  role,
  now = new Date(),
}: AuthorizeSessionEntryTokenInput): Promise<AuthorizeSessionEntryTokenResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true, startAt: true, endAt: true },
  });

  if (!session) {
    return { ok: false, status: 404, reason: 'session_not_found' };
  }

  const isParticipant =
    session.studentId === userId || role === UserRole.ADMIN;
  if (!isParticipant) {
    return { ok: false, status: 403, reason: 'not_participant' };
  }

  if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return { ok: false, status: 403, reason: 'session_not_active' };
  }

  const nowMs = now.getTime();
  const windowOpensMs = session.startAt.getTime() - ENTRY_WINDOW_LEAD_MS;
  const windowClosesMs = session.endAt.getTime() + ENTRY_WINDOW_GRACE_MS;
  if (nowMs < windowOpensMs || nowMs > windowClosesMs) {
    return { ok: false, status: 403, reason: 'outside_access_window' };
  }

  const payloadRole = role === UserRole.ADMIN ? 'ADMIN' : 'STUDENT';
  return {
    ok: true,
    payload: sessionEntryTokenPayloadSchema.parse({
      userId,
      sessionId,
      role: payloadRole,
      purpose: SESSION_ENTRY_TOKEN_PURPOSE,
    }),
  };
}

/**
 * Assina o JWT curto de entrada (HS256, `SESSION_ENTRY_TOKEN_SECRET`,
 * expiresIn 5m). Lê `process.env.SESSION_ENTRY_TOKEN_SECRET` diretamente para
 * não acoplar o boot do service à validação global de env (mesmo padrão de
 * notes-token). Lança em caso de secret ausente/curto; o route mapeia para
 * 500 + log `session_entry_token.error` (Zero Silencio).
 */
export function issueSessionEntryToken(payload: SessionEntryTokenPayload): string {
  const secret = process.env.SESSION_ENTRY_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_ENTRY_TOKEN_SECRET not configured or too short');
  }

  const claims = sessionEntryTokenPayloadSchema.parse(payload);
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    expiresIn: SESSION_ENTRY_TOKEN_TTL,
  });
}
