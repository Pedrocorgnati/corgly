import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { AuthPageWrapper } from '@/components/shared';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import {
  MAGIC_LINK_CALLBACK_PATH,
  MAGIC_LINK_ERROR_PARAM,
  MAGIC_LINK_ERRORS,
  MAGIC_LINK_TOKEN_PARAM,
} from './contract';

export const metadata: Metadata = {
  title: 'Acesso por link',
  robots: { index: false, follow: false },
};

// A pagina despacha o token para o callback e nao pode ser cacheada.
export const dynamic = 'force-dynamic';

interface MagicLinkPageProps {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}

/** Copy por codigo de falha devolvido pelo callback. */
const ERROR_COPY: Record<string, { title: string; description: string }> = {
  [MAGIC_LINK_ERRORS.INVALID]: {
    title: 'Link inválido',
    description: 'Link expirado ou já utilizado, solicite outro.',
  },
  [MAGIC_LINK_ERRORS.UNAVAILABLE]: {
    title: 'Não foi possível entrar agora',
    description:
      'Tivemos uma falha temporária ao validar seu link. Tente abrir o link de novo em alguns instantes ou solicite um novo.',
  },
};

const FALLBACK_ERROR_COPY = ERROR_COPY[MAGIC_LINK_ERRORS.INVALID];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * T-045 — Página de magic-link (login sem senha).
 *
 * Três fluxos:
 *   1. Sem query        → renderiza o formulário de solicitação (MagicLinkForm).
 *   2. Com ?token=      → repassa o token para o Route Handler
 *                         `/auth/magic-link/callback`, que é onde emitir cookie
 *                         de sessão é permitido. Esta página NÃO consome o
 *                         token: durante a renderização de um Server Component
 *                         o cookie store é somente leitura e `cookies().set()`
 *                         lança — o token de uso único era queimado logo antes
 *                         e o usuário ficava sem sessão e sem link válido.
 *   3. Com ?error=      → estado explícito de falha devolvido pelo callback,
 *                         com texto por código e caminho de saída (solicitar
 *                         outro link ou voltar ao login). Nunca autentica.
 */
export default async function MagicLinkPage({ searchParams }: MagicLinkPageProps) {
  const params = await searchParams;
  const rawToken = firstParam(params[MAGIC_LINK_TOKEN_PARAM]);

  // ── Fluxo 2: callback do link ──────────────────────────────────────────
  if (rawToken) {
    // 307 do lado do servidor; o navegador segue para o Route Handler, que
    // consome o token, emite o cookie e redireciona para o destino pós-login.
    redirect(
      `${MAGIC_LINK_CALLBACK_PATH}?${new URLSearchParams({ [MAGIC_LINK_TOKEN_PARAM]: rawToken })}`,
    );
  }

  // ── Fluxo 3: falha devolvida pelo callback ─────────────────────────────
  const errorCode = firstParam(params[MAGIC_LINK_ERROR_PARAM]);
  if (errorCode) {
    const copy = ERROR_COPY[errorCode] ?? FALLBACK_ERROR_COPY;

    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-magic-link" className="w-full max-w-[384px]">
          <div data-testid="auth-magic-link-error" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.description}</p>
            <Link data-testid="auth-magic-link-retry-link" href={ROUTES.MAGIC_LINK} className={cn(buttonVariants(), 'w-full')}>
              Solicitar novo link
            </Link>
            <Link
              data-testid="auth-magic-link-back-login-link"
              href={ROUTES.LOGIN}
              className="block text-sm text-primary font-medium hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  // ── Fluxo 1: solicitação do link ───────────────────────────────────────
  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-magic-link" className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div data-testid="auth-magic-link-header" className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Acesso por link</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Informe seu email e enviaremos um link de acesso. Sem senha.
            </p>
          </div>
          <MagicLinkForm />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            ← Voltar para o login
          </Link>
        </p>
      </div>
    </AuthPageWrapper>
  );
}
