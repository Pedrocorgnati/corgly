import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { ProfileForm } from '@/components/auth/profile-form';
import { LgpdSection } from '@/components/auth/lgpd-section';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Configurações',
};

export default function AccountPage() {
  return (
    <PageWrapper className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie seu perfil e preferências</p>
      </div>
      <ProfileForm />

      {/* LGPD section */}
      <div className="mt-6">
        <LgpdSection />
      </div>

      {/* Quick link to billing */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Pagamentos</p>
            <p className="text-xs text-muted-foreground mt-0.5">Histórico de compras e métodos de pagamento</p>
          </div>
          <Link href={ROUTES.ACCOUNT_BILLING}>
            <Button variant="outline" size="sm" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Ver pagamentos
            </Button>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
