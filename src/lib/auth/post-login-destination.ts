import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { sanitizeAdminRedirectTo } from '@/lib/auth/safe-redirect';

/**
 * Ponto UNICO de decisao do destino pos-login.
 *
 * Todo caminho de autenticacao (login por senha, callback de magic-link e
 * qualquer outro que venha depois) chama esta funcao em vez de reimplementar a
 * ramificacao. Antes, o login por senha ramificava por papel e onboarding e o
 * magic-link mandava todo mundo para o dashboard do aluno: um admin que entrava
 * por link caia no fluxo de aluno.
 *
 * Modulo puro de proposito (sem `next/*`, sem `server-only`): e importado tanto
 * de client component quanto de server component.
 */

export interface PostLoginUser {
  role: string;
  /** `null`/`undefined` significa onboarding pendente. */
  onboardingCompletedAt: string | Date | null | undefined;
}

/**
 * Regras, nesta ordem:
 *   1. ADMIN nunca passa pelo onboarding (fluxo exclusivo de aluno). Vai para o
 *      `redirectTo` pedido pelo proxy, ja sanitizado (fail-closed para
 *      /admin/dashboard em qualquer valor suspeito ou ausente).
 *   2. Aluno sem `onboardingCompletedAt` vai para o onboarding.
 *   3. Aluno com onboarding concluido vai para o dashboard.
 *
 * @param redirectTo valor cru de `?redirectTo=` (so honrado para ADMIN, unico
 *   papel para o qual o proxy escreve o parametro). Passa por
 *   `sanitizeAdminRedirectTo`, que rejeita URL absoluta de outro host, `//`,
 *   barra invertida e qualquer path fora de `/admin/*` — sem isso o parametro
 *   seria um open redirect.
 */
export function resolvePostLoginDestination(
  user: PostLoginUser,
  redirectTo?: string | null,
): string {
  if (user.role === UserRole.ADMIN) {
    return sanitizeAdminRedirectTo(redirectTo);
  }

  if (!user.onboardingCompletedAt) {
    return ROUTES.ONBOARDING;
  }

  return ROUTES.DASHBOARD;
}
