import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { encryptCredential } from '@/lib/google/credential-crypto';
import {
  getGoogleOAuthConfig,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '@/lib/google/oauth-config';
import { verifyOAuthState } from '@/lib/google/oauth-state';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';

/**
 * GET /api/v1/google/calendar/callback
 *
 * Callback do consentimento OAuth. E GET de redirect do Google: chega sem
 * sessao por construcao, por isso o caminho COMPLETO esta em PUBLIC_API_PATHS
 * (src/proxy.ts). Nenhum segredo e persistido ou logado em claro: o
 * `refresh_token` entra cifrado via `encryptCredential`; o `access_token` e o
 * `expires_in` da troca sao descartados ao fim do request.
 */

const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function redirectToGoogleCalendar(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  // GAP-12: o resultado do consentimento precisa aparecer na tela da conexao.
  // O redirect volta para /admin/google-calendar (que renderiza o banner com
  // esses searchParams), nao para /admin/schedule, onde o professor nao via
  // confirmacao alguma (Zero Silencio).
  const url = new URL('/admin/google-calendar', request.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url.toString(), { status: 307 });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 1. Professor recusou o consentimento (ex.: error=access_denied): nao chamar o Google.
  const oauthError = searchParams.get('error');
  if (oauthError) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: oauthError });
  }

  // 2. State assinado (anti-CSRF): invalido ou expirado interrompe tudo.
  const state = searchParams.get('state') ?? '';
  let userId: string;
  try {
    userId = verifyOAuthState(state).userId;
  } catch {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'invalid_state' });
  }

  // 3. Troca do codigo por tokens. Fetch e parse DENTRO do try/catch (GAP-12):
  //    falha de rede ou corpo ilegivel redireciona com exchange_failed em vez
  //    de estourar 500 no callback do Google.
  const code = searchParams.get('code');
  if (!code) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_failed' });
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message, null, err.code), { status: err.status });
    }
    throw err;
  }

  let tokenBody: {
    scope?: string;
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
  };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_failed' });
    }
    tokenBody = (await tokenRes.json()) as typeof tokenBody;
  } catch {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_failed' });
  }

  // 4. Assertiva de escopo (token a token, sem casamento por substring): o
  // consentimento precisa ter concedido exatamente a leitura; qualquer escopo
  // de escrita rejeita SEM escrita em banco. Integracao unidirecional e
  // restritiva (regra transversal, source.md L99).
  const grantedScopes = (tokenBody.scope ?? '').split(' ').filter(Boolean);
  const hasReadonly = grantedScopes.includes(GOOGLE_CALENDAR_READONLY_SCOPE);
  const hasWrite = WRITE_SCOPES.some((s) => grantedScopes.includes(s));
  if (!hasReadonly || hasWrite) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'scope_rejected' });
  }

  // 5. Sem refresh_token (consentimento reaproveitado sem prompt=consent): nao
  // ha o que guardar; o professor precisa refazer o consentimento.
  if (!tokenBody.refresh_token) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'missing_refresh_token' });
  }

  // 6. Persistencia cifrada (upsert por professor). access_token/expires_in
  // NUNCA sao persistidos nem logados: descartados ao fim do request.
  const refreshTokenEnc = encryptCredential(tokenBody.refresh_token);
  const grantedScope = tokenBody.scope ?? GOOGLE_CALENDAR_READONLY_SCOPE;
  const credential = await prisma.googleCalendarCredential.upsert({
    where: { userId },
    create: { userId, refreshTokenEnc, scope: grantedScope },
    update: { refreshTokenEnc, scope: grantedScope },
  });

  // 7. Criar o canal automaticamente. A credencial permanece persistida se o
  // Google estiver indisponivel, e o cron retoma o estado pending.
  try {
    await googleCalendarPushService.createChannel(credential.userId);
  } catch {
    return redirectToGoogleCalendar(request, { google: 'connected', channel: 'pending' });
  }

  // 8. Sucesso.
  return redirectToGoogleCalendar(request, { google: 'connected' });
}
