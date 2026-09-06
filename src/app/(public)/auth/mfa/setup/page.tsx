import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/data/auth';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { mfaService, type MfaStatusView } from '@/services/mfa.service';
import { sanitizeAdminRedirectTo, withRedirectTo } from '@/lib/auth/safe-redirect';
import { AuthPageWrapper } from '@/components/shared';
import { MfaEnrollmentClient } from '@/components/auth/mfa-enrollment-client';
import { MfaExitRow } from '@/components/auth/mfa-exit-row';

export const metadata: Metadata = {
  title: 'Configurar MFA',
  description: 'Ative a autenticação em duas etapas do seu acesso administrativo.',
  robots: { index: false, follow: false },
};

// Depende da sessao/DB: nao prerenderizar.
export const dynamic = 'force-dynamic';

const EMPTY_STATUS: MfaStatusView = {
  enabled: false,
  status: 'NONE',
  confirmedAt: null,
  recoveryCodesRemaining: 0,
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Tela publica de primeiro cadastro de MFA do admin.
 *
 * Fica fora do prefixo /admin (que o proxy bloqueia sem MFA recente) e por isso
 * e alcancavel por um admin recem-logado sem MFA. Fluxo: proxy -> challenge
 * (detecta MFA nao ativo) -> setup -> painel.
 *
 * Redirects (fora do try/catch: redirect() lanca NEXT_REDIRECT):
 * - anonimo -> login (redirectTo=/auth/mfa/setup);
 * - nao-admin -> dashboard do aluno;
 * - MFA ja ACTIVE -> /admin/account/security (gestao continua; nunca loop com o
 *   challenge, que so envia para ca quando status !== ACTIVE).
 */
export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeAdminRedirectTo(firstParam(params.redirectTo));

  const user = await getAuthUser();
  if (!user?.id) {
    redirect(withRedirectTo(ROUTES.LOGIN, ROUTES.MFA_SETUP));
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

  if (status?.status === 'ACTIVE') {
    redirect(ROUTES.ADMIN_ACCOUNT_SECURITY);
  }

  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-mfa-setup" className="w-full max-w-[480px]">
        <header data-testid="auth-mfa-setup-header" className="mb-6 text-center">
          <h1 className="text-2xl md:text-[26px] font-bold text-foreground">
            Configurar autenticação em duas etapas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sua conta administrativa precisa do MFA ativo para acessar o painel. Leva
            menos de um minuto.
          </p>
        </header>

        <MfaEnrollmentClient
          mode="setup"
          initialStatus={status ?? EMPTY_STATUS}
          loadError={status === null}
          redirectTo={redirectTo}
        />

        <MfaExitRow />
      </div>
    </AuthPageWrapper>
  );
}
