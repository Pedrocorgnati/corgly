import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';
import { DataRightsRequestForm } from '@/components/privacy/data-rights-request-form';

export const metadata: Metadata = {
  title: 'Direitos sobre os dados',
};

/** Os quatro direitos do titular cobertos pelo fluxo DSR (LGPD Art. 18). */
const RIGHTS = [
  { slug: 'export', title: 'Exportação (acesso)', text: 'Uma cópia completa dos dados da sua conta.' },
  { slug: 'correction', title: 'Correção', text: 'Atualização de dados incompletos ou inexatos.' },
  { slug: 'portability', title: 'Portabilidade', text: 'Seus dados em formato estruturado e transferível.' },
  { slug: 'deletion', title: 'Exclusão', text: 'Remoção dos seus dados, com janela de arrependimento.' },
] as const;

export default async function StudentDataRightsPage() {
  const session = await getSession();
  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  // `getSession` não expõe o e-mail; busca direta para pré-preencher o formulário.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });

  return (
    <PageWrapper data-testid="page-account-privacy-data-rights" className="max-w-2xl">
      <div data-testid="account-data-rights-header" className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Direitos sobre os dados</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Em conformidade com a LGPD e o GDPR, gerencie o acesso, a correção, a portabilidade e a
          exclusão dos seus dados pessoais.
        </p>
      </div>

      <section data-testid="account-data-rights-list" className="grid gap-3 sm:grid-cols-2 mb-8" aria-label="Direitos do titular">
        {RIGHTS.map((right) => (
          <div key={right.title} data-testid={`account-data-right-${right.slug}`} className="bg-card border border-border rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-foreground">{right.title}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{right.text}</p>
          </div>
        ))}
      </section>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Abrir uma solicitação</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Como você está autenticado, usaremos o e-mail da sua conta para confirmar o pedido.
        </p>
      </div>

      <div data-testid="account-data-rights-form-section">
        <DataRightsRequestForm defaultEmail={user?.email ?? ''} emailLocked={Boolean(user?.email)} />
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <Link href={ROUTES.ACCOUNT} data-testid="account-data-rights-back-link" className="text-muted-foreground text-sm hover:underline">
          &larr; Voltar para Configurações
        </Link>
      </div>
    </PageWrapper>
  );
}
