import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/data/auth';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { mfaService, type MfaStatusView } from '@/services/mfa.service';
import { sanitizeAdminRedirectTo, withRedirectTo } from '@/lib/auth/safe-redirect';
import { AuthPageWrapper } from '@/components/shared';
import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form';
import { MfaLoadError } from '@/components/auth/mfa-load-error';
import { MfaExitRow } from '@/components/auth/mfa-exit-row';

export const metadata: Metadata = {
  title: 'Verificação em duas etapas',
  description: 'Confirme sua identidade para acessar a área administrativa.',
  robots: { index: false, follow: false },
};

// Depende da sessao/DB: nao prerenderizar.
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Verificacao em duas etapas (step-up) do admin. Destino do redirect do proxy
 * (src/proxy.ts) quando o JWT admin nao tem `mfaAt` recente.
 *
 * Redirects (fora do try/catch: redirect() lanca NEXT_REDIRECT):
 * - anonimo -> login (redirectTo preservado);
 * - nao-admin -> dashboard do aluno;
 * - MFA nao ACTIVE (NONE/PENDING) -> /auth/mfa/setup (redirectTo preservado).
 *   Complementar ao setup, que so redireciona para ca... nunca: ele envia ACTIVE
 *   para /admin/account/security. Sem loop possivel.
 * - status ilegivel (DB fora) -> fail-closed: mostra erro com retry, nao o form.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeAdminRedirectTo(firstParam(params.redirectTo));

  const user = await getAuthUser();
  if (!user?.id) {
    redirect(withRedirectTo(ROUTES.LOGIN, redirectTo));
  }
  if (user.role !== UserRole.ADMIN) {
    redirect(ROUTES.DASHBOARD);
  }

  let status: MfaStatusView | null = null;
  try {
    status = await mfaService.getMfaStatus(user.id);
  } catch {
    status = null;
  }

  if (status && status.status !== 'ACTIVE') {
    redirect(withRedirectTo(ROUTES.MFA_SETUP, redirectTo));
  }

  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-mfa-challenge" className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <header data-testid="auth-mfa-challenge-header" className="mb-6">
            <h1 className="text-2xl md:text-[26px] font-bold text-foreground">
              Verificação em duas etapas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Confirme sua identidade para acessar a área administrativa.
            </p>
          </header>

          {status === null ? <MfaLoadError /> : <MfaChallengeForm redirectTo={redirectTo} />}
        </div>

        <MfaExitRow />
      </div>
    </AuthPageWrapper>
  );
}
