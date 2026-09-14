import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import {
  getGoogleOAuthConfig,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '@/lib/google/oauth-config';
import { signOAuthState } from '@/lib/google/oauth-state';

/**
 * GET /api/v1/google/calendar/connect
 *
 * Inicia o consentimento OAuth do professor: 307 para o Google com escopo de
 * leitura apenas, `access_type=offline` + `prompt=consent` (garante emissao de
 * refresh token) e `state` assinado contra CSRF. Cai no ramo autenticado
 * default do proxy: sem sessao o proxy responde 401 antes deste handler.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const config = getGoogleOAuthConfig();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_CALENDAR_READONLY_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', signOAuthState(auth.id));
    return NextResponse.redirect(url.toString(), { status: 307 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, err.message, null, err.code),
        { status: err.status },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
