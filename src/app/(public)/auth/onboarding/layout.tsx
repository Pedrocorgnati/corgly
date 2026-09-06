import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { getAuthUser } from '@/lib/data/auth';

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
  const user = await getAuthUser();

  // Visitante anonimo nao tem onboarding: manda para o login.
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Onboarding e fluxo exclusivo de aluno. Admin volta para a area admin
  // por qualquer caminho de entrada (link direto, historico, deep link).
  if (user.role === UserRole.ADMIN) {
    redirect(ROUTES.ADMIN_DASHBOARD);
  }

  // Fail-closed: papel desconhecido nao entra no fluxo de aluno.
  if (user.role !== UserRole.STUDENT) {
    redirect(ROUTES.LOGIN);
  }

  return <>{children}</>;
}
