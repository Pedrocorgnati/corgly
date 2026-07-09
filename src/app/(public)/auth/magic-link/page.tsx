import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { COOKIE_NAME } from '@/lib/auth';
import { env } from '@/lib/env';
import { magicLinkService } from '@/lib/auth/magic-link.service';
import { AuthPageWrapper } from '@/components/shared';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Acesso por link',
  robots: { index: false, follow: false },
};

// O callback consome o token e emite cookie httpOnly — nunca deve ser cacheado.
export const dynamic = 'force-dynamic';

interface MagicLinkPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * T-045 — Página de magic-link (login sem senha).
 *
 * Dois fluxos:
 *   1. Sem ?token=  → renderiza o formulário de solicitação (MagicLinkForm).
 *   2. Com ?token=  → consome o token server-side:
 *        - sucesso  → emite o cookie de sessão e redireciona ao dashboard;
 *        - falha    → renderiza estado explícito "link expirado ou já utilizado"
 *                     SEM autenticar (AC3).
 */
export default async function MagicLinkPage({ searchParams }: MagicLinkPageProps) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;

  // ── Fluxo 2: callback do link ──────────────────────────────────────────
  if (rawToken) {
    const result = await magicLinkService.consumeMagicLink(rawToken);

    if (result.ok) {
      // Emite o cookie de sessão httpOnly, espelhando setAuthCookie() (auth.ts).
      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 dias
        path: '/',
      });
      // redirect() lança internamente — efetiva o cookie + navegação.
      redirect(ROUTES.DASHBOARD);
    }

    // Token inválido, expirado ou já utilizado — estado explícito, sem autenticar.
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Link inválido</h1>
            <p className="text-sm text-muted-foreground">
              Link expirado ou já utilizado, solicite outro.
            </p>
            <Link href={ROUTES.MAGIC_LINK} className={cn(buttonVariants(), 'w-full')}>
              Solicitar novo link
            </Link>
            <Link
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
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
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
