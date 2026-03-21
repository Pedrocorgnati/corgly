import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Faça login na sua conta Corgly.',
};

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl md:text-[26px] font-bold text-foreground">Entrar</h1>
            <p className="text-sm text-muted-foreground mt-1">Bem-vindo de volta</p>
          </div>
          <LoginForm />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Não tem conta?{' '}
          <Link href={ROUTES.REGISTER} className="text-primary font-medium hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
