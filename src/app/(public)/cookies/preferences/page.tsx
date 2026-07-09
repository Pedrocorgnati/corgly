import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { CookiePreferencesForm } from '@/components/legal/cookie-preferences-form';

export const metadata: Metadata = {
  title: 'Preferências de cookies',
  description:
    'Gerencie seu consentimento de cookies por categoria. Cookies essenciais são sempre ativos; analytics e marketing são opcionais e revogáveis.',
};

export default function CookiePreferencesPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Preferências de cookies</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Escolha quais categorias de cookies não essenciais você permite. Suas escolhas são salvas
            neste dispositivo e podem ser alteradas a qualquer momento.
          </p>
        </div>

        <CookiePreferencesForm />

        <div className="mt-8 pt-6 border-t border-border">
          <Link
            href={ROUTES.COOKIES}
            className="text-primary text-sm font-medium hover:underline mr-4"
          >
            Política de Cookies
          </Link>
          <Link
            href={ROUTES.PRIVACY}
            className="text-muted-foreground text-sm hover:underline mr-4"
          >
            Política de Privacidade
          </Link>
          <Link href={ROUTES.HOME} className="text-muted-foreground text-sm hover:underline">
            &larr; Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
