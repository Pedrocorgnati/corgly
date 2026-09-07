import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { magicLinkService } from '@/lib/auth/magic-link.service';
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination';
import { authService } from '@/services/auth.service';
import { ROUTES } from '@/lib/constants/routes';
import {
  MAGIC_LINK_ERROR_PARAM,
  MAGIC_LINK_ERRORS,
  MAGIC_LINK_TOKEN_PARAM,
  type MagicLinkErrorCode,
} from '../contract';

// O callback consome um token de uso unico e emite cookie httpOnly.
export const dynamic = 'force-dynamic';

/**
 * GET /auth/magic-link/callback?token=...
 *
 * Route Handler porque emitir cookie de sessao SO e possivel aqui ou em Server
 * Action: durante a renderizacao de um Server Component o cookie store e
 * somente leitura e `cookies().set()` lanca. Antes este trecho vivia dentro de
 * `page.tsx`, depois de `consumeMagicLink` ja ter queimado o token de uso
 * unico — o usuario terminava sem sessao E sem link reaproveitavel.
 *
 * Mesmo padrao de POST /api/v1/auth/login: monta a resposta primeiro e escreve
 * o cookie nela com `setAuthCookie`, o unico emissor de cookie de sessao do
 * sistema.
 *
 * Este handler fica fora de `/api/v1` de proposito: `PUBLIC_API_PATHS` do
 * proxy nao cobre magic-link, entao um GET anonimo sob `/api/v1` levaria 401
 * antes de chegar aqui. Rotas nao-API nao passam pelo gate de sessao.
 *
 * Sempre termina em navegacao: sucesso vai para o destino pos-login, falha
 * volta para a pagina com `?error=`, que renderiza o estado explicito.
 */
export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get(MAGIC_LINK_TOKEN_PARAM);

  if (!rawToken) {
    return redirectToPageWithError(request, MAGIC_LINK_ERRORS.INVALID);
  }

  let result: Awaited<ReturnType<typeof magicLinkService.consumeMagicLink>>;
  try {
    result = await magicLinkService.consumeMagicLink(rawToken);
  } catch (error) {
    // Banco fora do ar ou falha equivalente: o token pode nao ter sido
    // consumido, entao a mensagem convida a tentar de novo em vez de afirmar
    // que o link morreu.
    console.error('[magic-link/callback] falha ao consumir token:', error);
    return redirectToPageWithError(request, MAGIC_LINK_ERRORS.UNAVAILABLE);
  }

  if (!result.ok) {
    return redirectToPageWithError(request, MAGIC_LINK_ERRORS.INVALID);
  }

  // `consumeMagicLink` devolve so {id, name, role}; o onboarding vem do perfil.
  // Perfil ausente ou leitura falha caem no ramo "onboarding pendente", que e o
  // destino seguro para aluno — o token ja foi consumido, entao nao ha volta.
  let onboardingCompletedAt: Date | null = null;
  try {
    const profile = await authService.getMe(result.user.id);
    onboardingCompletedAt = profile?.onboardingCompletedAt ?? null;
  } catch (error) {
    console.error('[magic-link/callback] falha ao ler perfil pos-consumo:', error);
  }

  const destination = resolvePostLoginDestination({
    role: result.user.role,
    onboardingCompletedAt,
  });

  const response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  setAuthCookie(response, result.token);
  return response;
}

/**
 * Volta para `/auth/magic-link?error=<codigo>`. A pagina de destino nao tem
 * `?token=`, entao nao ha risco de loop: ela renderiza o card de erro.
 */
function redirectToPageWithError(request: NextRequest, code: MagicLinkErrorCode): NextResponse {
  const url = new URL(ROUTES.MAGIC_LINK, request.url);
  url.searchParams.set(MAGIC_LINK_ERROR_PARAM, code);
  return NextResponse.redirect(url, { status: 303 });
}
