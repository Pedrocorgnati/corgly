'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { internalApiOrigin } from '@/lib/internal-api';
import { API } from '@/lib/constants/routes';

/**
 * Marca o onboarding do usuario autenticado como concluido.
 *
 * Rota real: POST /api/v1/auth/onboarding (src/app/api/v1/auth/onboarding/route.ts).
 * A versao anterior fazia PATCH em /api/v1/auth/profile, rota que NAO existe:
 * o fetch respondia 404, a action lancava e o aluno voltava ao onboarding em
 * todo login seguinte, sem nunca gravar `onboardingCompletedAt`.
 *
 * Contrato da rota:
 *   - autenticacao pelo header `x-user-id`, que o proxy injeta a partir do JWT
 *     verificado — por isso encaminhamos o cookie de sessao (o proxy le o cookie
 *     antes do header Authorization);
 *   - NAO le o corpo da requisicao nem valida schema algum: o userId vem do
 *     token, nunca do payload. Mandamos `{}` apenas para a requisicao ter
 *     Content-Length coerente com o Content-Type declarado;
 *   - responde no envelope { data, error, message }.
 *
 * Origem: `internalApiOrigin()`, o mesmo helper usado por `getAuthUser`. Fora de
 * producao a porta e volatil (`next dev -p 3007`, E2E em porta livre) e
 * `NEXT_PUBLIC_SITE_URL` fica cravado em :3000 — chamar por ele bate em outro
 * servidor ou em porta morta.
 *
 * Seguranca: userId e conferido contra a sessao (anti-IDOR). Lanca em qualquer
 * falha para o caller poder dar feedback visivel.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized: no active session');
  }

  if (session.user.id !== userId) {
    throw new Error('Unauthorized: user ID mismatch');
  }

  const cookieStore = await cookies();
  const origin = await internalApiOrigin();

  let res: Response;
  try {
    res = await fetch(`${origin}${API.AUTH.ONBOARDING}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.error('[completeOnboarding] network failure:', err);
    throw new Error('Falha ao completar onboarding. Tente novamente.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string | null } | null;
    console.error('[completeOnboarding] status:', res.status, 'error:', body?.error ?? null);
    throw new Error('Falha ao completar onboarding. Tente novamente.');
  }
}
