import type { Metadata } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { LoginForm } from '@/components/auth/login-form';
import { AuthPageWrapper } from '@/components/shared';

// Ate 2026-09-07 titulo, descricao e a copy da pagina eram portugues cravado e
// ignoravam o idioma escolhido pelo visitante.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.auth.login');
  return {
    title: t('metaTitle'),
    description: t('metaDesc'),
    robots: { index: false, follow: false },
  };
}

export default function LoginPage() {
  const t = useTranslations('pages.auth.login');

  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-login" className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div data-testid="auth-login-header" className="mb-6">
            <h1 className="text-2xl md:text-[26px] font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
          </div>
          <LoginForm />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          {t('noAccount')}{' '}
          <Link href={ROUTES.REGISTER} className="text-primary font-medium hover:underline">
            {t('createAccount')}
          </Link>
        </p>
      </div>
    </AuthPageWrapper>
  );
}
