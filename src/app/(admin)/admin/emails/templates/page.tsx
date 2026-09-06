import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { EmailTemplatesClient } from '@/components/admin/EmailTemplatesClient';

export const metadata: Metadata = {
  title: 'Admin — Templates de email',
};

export default function AdminEmailTemplatesPage() {
  return (
    <PageWrapper data-testid="page-admin-emails-templates">
      <div data-testid="admin-emails-templates-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Templates de email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie versoes, publique e arquive os templates transacionais. O preview
          renderiza apenas as variaveis permitidas, sem executar HTML inseguro.
        </p>
      </div>
      <EmailTemplatesClient />
    </PageWrapper>
  );
}
