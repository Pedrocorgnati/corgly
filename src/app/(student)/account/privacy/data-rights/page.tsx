import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ROUTES } from '@/lib/constants/routes';
import { PageWrapper } from '@/components/shared';
import { DataRightsRequestForm } from '@/components/privacy/data-rights-request-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.dataRights');
  return { title: t('metaTitle') };
}

/**
 * Os quatro direitos do titular cobertos pelo fluxo DSR (LGPD Art. 18).
 *
 * So os slugs ficam no codigo: o texto sai do catalogo (`pages.dataRights.rights.*`)
 * porque ate 2026-09-07 esta pagina cravava portugues e ignorava o idioma do aluno.
 */
const RIGHT_SLUGS = ['export', 'correction', 'portability', 'deletion'] as const;

export default async function StudentDataRightsPage() {
  const session = await getSession();
  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  const t = await getTranslations('pages.dataRights');

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
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <section data-testid="account-data-rights-list" className="grid gap-3 sm:grid-cols-2 mb-8" aria-label={t('rightsAria')}>
        {RIGHT_SLUGS.map((slug) => (
          <div key={slug} data-testid={`account-data-right-${slug}`} className="bg-card border border-border rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-foreground">{t(`rights.${slug}.title`)}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(`rights.${slug}.text`)}</p>
          </div>
        ))}
      </section>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t('requestTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('requestSubtitle')}</p>
      </div>

      <div data-testid="account-data-rights-form-section">
        <DataRightsRequestForm defaultEmail={user?.email ?? ''} emailLocked={Boolean(user?.email)} />
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <Link href={ROUTES.ACCOUNT} data-testid="account-data-rights-back-link" className="text-muted-foreground text-sm hover:underline">
          &larr; {t('back')}
        </Link>
      </div>
    </PageWrapper>
  );
}
