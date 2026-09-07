import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { UserRole } from '@/lib/constants/enums';
import { COOKIE_NAME, verifyJWT } from '@/lib/auth';
import { authService } from '@/services/auth.service';
import { creditService } from '@/services/credit.service';

/**
 * Contrato do usuario de sessao visto pelos Server Components.
 *
 * Este schema e a fronteira: o objeto montado abaixo e VALIDADO contra ele,
 * nunca castado. O cast cru anterior (`json.data as AuthUser`) deixou passar um
 * campo fantasma — `creditBalance` era declarado obrigatorio aqui e a origem
 * nunca o emitia, entao todo aluno chegava em `/schedule` com `undefined` e o
 * `?? 0` do consumidor o classificava como "sem credito". Campo declarado aqui
 * e campo que o produtor precisa emitir; se ele sumir, `getAuthUser` devolve
 * `null` (fail-closed) com o motivo no log do servidor, em vez de propagar um
 * `undefined` silencioso.
 *
 * Todo campo abaixo tem produtor comprovado:
 *   - id/name/email/role/emailConfirmed: `AuthService.getMe` (select explicito);
 *   - creditBalance: `CreditService.getBalance` (fonte unica de saldo do sistema).
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
 * Usuario da sessao corrente, lido DIRETO do banco.
 *
 * Envolvido em React.cache() para que varias chamadas no mesmo ciclo de render
 * (layout + page + server action) sejam deduplicadas em uma unica leitura.
 *
 * NAO FAZ HTTP DE PROPOSITO. Ate 2026-09-07 esta funcao chamava
 * `GET /api/v1/auth/me` pela rede, usando `internalApiOrigin()` como base. Como
 * essa origem sai de `NEXT_PUBLIC_APP_URL`, que o Next INLINEIA no bundle em
 * tempo de build, o build de producao subiu com `http://localhost:3000` cravado:
 * o fetch morria em ECONNREFUSED dentro do `catch`, toda pagina logada concluia
 * "sem sessao" e a area logada inteira voltava para /auth/login — com o login
 * respondendo 200 e o cookie valido. O gate de sessao e caminho critico demais
 * para depender da aplicacao conseguir alcancar a si mesma pela rede publica.
 *
 * Ler o banco aqui e o padrao ja adotado pelas outras paginas de sessao
 * (`/auth/mfa/*` chamam `mfaService` direto). A verificacao de credencial e a
 * MESMA do proxy: assinatura do JWT do cookie `corgly_token`.
 *
 * Devolve null quando nao ha cookie, quando o token nao valida, quando o
 * usuario nao existe mais ou quando o registro nao casa com o contrato acima.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;

    let userId: string;
    try {
      userId = verifyJWT(token).sub;
    } catch {
      return null; // expirado, assinatura invalida ou adulterado
    }

    const user = await authService.getMe(userId);
    if (!user) return null;

    // Sequencial de proposito: usuario inexistente nao dispara query de saldo.
    const creditBalance = await creditService.getBalance(userId);

    const parsed = authUserSchema.safeParse({ ...user, creditBalance });

    if (!parsed.success) {
      // Drift de contrato entre o select do service e este consumidor. Nao ha
      // como renderizar a area logada com um usuario pela metade; falha visivel
      // no log e o caller trata como "sem sessao" (redireciona para o login).
      console.error(
        '[getAuthUser] usuario fora do contrato:',
        z.flattenError(parsed.error).fieldErrors,
      );
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
});
