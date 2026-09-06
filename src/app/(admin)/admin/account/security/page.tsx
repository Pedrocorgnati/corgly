import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/data/auth';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { mfaService, type MfaStatusView } from '@/services/mfa.service';
import { MfaEnrollmentClient } from '@/components/auth/mfa-enrollment-client';

export const metadata: Metadata = {
  title: 'Segurança da conta',
};

// Status depende da sessao/DB: nao prerenderizar.
export const dynamic = 'force-dynamic';

/**
 * Pagina de seguranca da conta admin (T-043).
 *
 * Server Component: resolve o usuario autenticado e busca o status de MFA no
 * servidor. Passa o status inicial para o client component compartilhado
 * (MfaEnrollmentClient, modo `settings`), que trata os estados
 * loading/empty/error/success da interacao (cadastro e verificacao).
 */
export default async function AdminSecurityPage() {
  const user = await getAuthUser();
  if (!user || user.role !== UserRole.ADMIN) {
    redirect(ROUTES.LOGIN);
  }

  let initialStatus: MfaStatusView = {
    enabled: false,
    status: 'NONE',
    confirmedAt: null,
    recoveryCodesRemaining: 0,
  };
  let loadError = false;

  if (user.id) {
    try {
      initialStatus = await mfaService.getMfaStatus(user.id);
    } catch {
      loadError = true;
    }
  } else {
    loadError = true;
  }

  return (
    <div data-testid="page-admin-account-security" className="space-y-6">
      <header data-testid="admin-account-security-header">
        <h1 className="text-2xl font-bold text-foreground">Segurança da conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie a autenticação em duas etapas (MFA) do seu acesso administrativo.
        </p>
      </header>

      <MfaEnrollmentClient mode="settings" initialStatus={initialStatus} loadError={loadError} />
    </div>
  );
}
