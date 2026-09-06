import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { DataRightsRequestForm } from '@/components/privacy/data-rights-request-form';

export const metadata: Metadata = {
  title: 'Seus direitos sobre os dados',
  description:
    'Solicite exportação, correção, portabilidade ou exclusão dos seus dados pessoais em conformidade com a LGPD e o GDPR.',
};

/** Os quatro direitos do titular cobertos pelo fluxo DSR (LGPD Art. 18). */
const RIGHTS = [
  {
    title: 'Exportação (acesso)',
    text: 'Receba uma cópia de todos os dados pessoais que mantemos associados a você.',
  },
  {
    title: 'Correção',
    text: 'Solicite a atualização de dados incompletos, inexatos ou desatualizados.',
  },
  {
    title: 'Portabilidade',
    text: 'Receba seus dados em formato estruturado para transferir a outro serviço.',
  },
  {
    title: 'Exclusão',
    text: 'Peça a remoção dos seus dados pessoais, respeitada a janela de arrependimento.',
  },
] as const;

export default function PublicDataRightsPage() {
  return (
    <div data-testid="page-privacy-data-rights" className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div data-testid="privacy-data-rights-header" className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Seus direitos sobre os dados</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Em conformidade com a LGPD e o GDPR, você pode solicitar acesso, correção, portabilidade
            ou exclusão dos seus dados pessoais a qualquer momento, mesmo sem uma conta.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 mb-10" aria-label="Direitos do titular">
          {RIGHTS.map((right) => (
            <div key={right.title} className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-semibold text-foreground">{right.title}</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{right.text}</p>
            </div>
          ))}
        </section>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Abrir uma solicitação</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enviaremos um link de verificação ao seu e-mail antes de processar o pedido.
          </p>
        </div>

        <DataRightsRequestForm />

        <div className="mt-8 pt-6 border-t border-border">
          <Link href={ROUTES.PRIVACY} data-testid="privacy-data-rights-privacy-link" className="text-primary text-sm font-medium hover:underline mr-4">
            Política de Privacidade
          </Link>
          <Link href={ROUTES.HOME} data-testid="privacy-data-rights-back-link" className="text-muted-foreground text-sm hover:underline">
            &larr; Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
