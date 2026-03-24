import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { AuthPageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Recuperar Senha',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthPageWrapper>
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Informe seu email e enviaremos um link de recuperação.
            </p>
          </div>
          <ForgotPasswordForm />
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
