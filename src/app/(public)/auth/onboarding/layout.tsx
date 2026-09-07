import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { getSession } from '@/lib/auth/session';

// Le cookie de sessao a cada request: nunca pode ser pre-renderizado estaticamente.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bem-vindo ao Corgly',
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getSession (e nao getAuthUser) porque o gate precisa de `onboardingCompletedAt`,
  // campo que o shape `AuthUser` de src/lib/data/auth.ts nao expoe.
  const session = await getSession();

  // Visitante anonimo nao tem onboarding: manda para o login.
  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  const { role, onboardingCompletedAt } = session.user;

  // Onboarding e fluxo exclusivo de aluno. Admin volta para a area admin
  // por qualquer caminho de entrada (link direto, historico, deep link).
  if (role === UserRole.ADMIN) {
    redirect(ROUTES.ADMIN_DASHBOARD);
  }

  // Fail-closed: papel desconhecido nao entra no fluxo de aluno.
  if (role !== UserRole.STUDENT) {
    redirect(ROUTES.LOGIN);
  }

  // Gate fechado no outro sentido: quem JA concluiu nao refaz o onboarding por
  // link direto, historico ou botao de voltar. Sem isto, `completeOnboarding`
  // rodava de novo e `isFirstPurchase` era zerado uma segunda vez.
  if (onboardingCompletedAt) {
    redirect(ROUTES.DASHBOARD);
  }

  return <>{children}</>;
}
