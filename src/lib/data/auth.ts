import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { UserRole } from '@/lib/constants/enums';
import { internalApiOrigin } from '@/lib/internal-api';

/**
 * Contrato de GET /api/v1/auth/me visto pelos Server Components.
 *
 * Este schema e a fronteira: a resposta HTTP e VALIDADA contra ele, nunca
 * castada. O cast cru anterior (`json.data as AuthUser`) deixou passar um campo
 * fantasma — `creditBalance` era declarado obrigatorio aqui e a rota nunca o
 * emitia, entao todo aluno chegava em `/schedule` com `undefined` e o `?? 0`
 * do consumidor o classificava como "sem credito". Campo declarado aqui e
 * campo que o produtor precisa emitir; se ele sumir, `getAuthUser` devolve
 * `null` (fail-closed) com o motivo no log do servidor, em vez de propagar um
 * `undefined` silencioso.
 *
 * Todo campo abaixo tem produtor comprovado:
 *   - id/name/email/role/emailConfirmed: `AuthService.getMe` (select explicito);
 *   - creditBalance: `CreditService.getBalance`, somado pela propria rota
 *     `/api/v1/auth/me` (fonte unica de saldo do sistema).
 */
const authUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  role: z.enum(UserRole),
  /** Saldo de creditos validos (nao expirados). Produtor: CreditService.getBalance. */
  creditBalance: z.number(),
  emailConfirmed: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * Fetches the authenticated user from /api/v1/auth/me.
 * Wrapped in React.cache() so multiple calls in the same render cycle
 * (e.g., layout + page + server action) are deduplicated to a single HTTP request.
 *
 * Returns null if unauthenticated, if the request fails, or se a resposta nao
 * casar com o contrato acima.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const cookieStore = await cookies();
    const res = await fetch(`${await internalApiOrigin()}/api/v1/auth/me`, {
      cache: 'no-store',
      headers: { Cookie: cookieStore.toString() },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: unknown } | null;
    const parsed = authUserSchema.safeParse(json?.data);

    if (!parsed.success) {
      // Drift de contrato entre a rota e este consumidor. Nao ha como renderizar
      // a area logada com um usuario pela metade; falha visivel no log e o
      // caller trata como "sem sessao" (redireciona para o login).
      console.error(
        '[getAuthUser] resposta de /api/v1/auth/me fora do contrato:',
        z.flattenError(parsed.error).fieldErrors,
      );
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
});
