import type { Metadata } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { AuthPageWrapper } from '@/components/shared';

// Ate 2026-09-07 titulo e copy desta pagina eram portugues cravado e ignoravam o
// idioma escolhido pelo visitante.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.auth.forgotPassword');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordPage() {
  const t = useTranslations('pages.auth.forgotPassword');

  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-forgot-password" className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div data-testid="auth-forgot-password-header" className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
            </p>
          </div>
          <ForgotPasswordForm />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </AuthPageWrapper>
  );
}
