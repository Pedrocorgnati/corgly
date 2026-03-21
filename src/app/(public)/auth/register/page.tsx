import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Criar Conta',
  description: 'Crie sua conta no Corgly e comece a aprender português hoje.',
};

export default function RegisterPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[448px]">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl md:text-[26px] font-bold text-foreground">
              Criar Conta
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Junte-se ao Corgly e comece a aprender português
            </p>
          </div>
          <RegisterForm />
        </div>

        {/* Link to login */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Já tem uma conta?{' '}
          <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
