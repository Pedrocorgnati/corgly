import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';
import { NewTicketForm } from './new-ticket-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.supportNew');
  return { title: t('metaTitle') };
}

/**
 * ST-38: abertura de chamado de suporte pelo aluno.
 *
 * Server Component (segue a regra do projeto: `page.tsx` nunca é `'use client'`)
 * que renderiza o formulário interativo (`NewTicketForm`) com assunto,
 * prioridade, mensagem e anexos. A validação/sanitização real acontece no
 * boundary da API (`createTicketSchema`); o form valida o mesmo contrato no
 * client para feedback imediato.
 */
export default async function NewSupportTicketPage() {
  const t = await getTranslations('pages.supportNew');

  return (
    <PageWrapper data-testid="page-support-new" className="max-w-2xl">
      <Link
        data-testid="support-new-back-link"
        href={ROUTES.SUPPORT}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div data-testid="support-new-header" className="mb-6 flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <NewTicketForm />
    </PageWrapper>
  );
}
