/**
 * @module lib/google/oauth-config
 * Configuracao do fluxo OAuth do Google Calendar.
 *
 * As quatro variaveis `GOOGLE_CALENDAR_*` sao opcionais no schema de boot
 * (`src/lib/env.ts`) para nao derrubar ambientes sem a integracao; este helper
 * e o ponto de uso que exige as tres do fluxo (`CLIENT_ID`, `CLIENT_SECRET`,
 * `REDIRECT_URI`) e falha com 500 rastreavel quando alguma falta, espelhando o
 * contrato de `SESSION_ENTRY_TOKEN_SECRET` ("opcional no schema, exigido no uso").
 *
 * `GOOGLE_CALENDAR_API_KEY` fica registrada no schema de env mas nao e
 * consumida pelo fluxo OAuth.
 */

import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

/**
 * Unica fonte do escopo da integracao: leitura apenas. A regra transversal do
 * loop (source.md, L99) e "unidirecional e restritiva": NUNCA adicionar escopo
 * de escrita aqui.
 */
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Le as tres variaveis do fluxo OAuth ou lanca AppError 500 rastreavel. */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(
      'GOOGLE_CALENDAR_CONFIG_MISSING',
      'Integracao com o Google Calendar nao configurada.',
      500,
    );
  }
  return { clientId, clientSecret, redirectUri };
}
