import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { ROUTES } from '@/lib/constants/routes';
import { detectLocale } from '@/lib/detect-locale';
import { getActiveLegalDoc, toLegalLocale } from '@/lib/legal/legal.service';
import { LegalDocBody } from '@/components/legal/legal-doc-body';

export const dynamic = 'force-dynamic';

const FALLBACK_TITLE = 'Adendo de Processamento de Dados (DPA)';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const headerList = await headers();
  const locale = detectLocale(cookieStore, headerList.get('accept-language') ?? undefined);
  const doc = await getActiveLegalDoc('DPA', toLegalLocale(locale));
  return {
    title: doc?.title ?? FALLBACK_TITLE,
    description:
      'Adendo de processamento de dados da Corgly: papéis de controlador e operador, subprocessadores, transferências internacionais e medidas de segurança.',
  };
}

export default async function DataProcessingAddendumPage() {
  const cookieStore = await cookies();
  const headerList = await headers();
  const locale = detectLocale(cookieStore, headerList.get('accept-language') ?? undefined);
  const doc = await getActiveLegalDoc('DPA', toLegalLocale(locale));

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{doc?.title ?? FALLBACK_TITLE}</h1>
          {doc ? (
            <p className="text-sm text-muted-foreground mt-2">
              Versão {doc.version} · em vigor desde{' '}
              {new Date(doc.requiredSince).toLocaleDateString(locale)}
            </p>
          ) : null}
        </div>

        {doc ? (
          <LegalDocBody content={doc.content} />
        ) : (
          <p className="text-muted-foreground leading-relaxed">
            Nenhum adendo de processamento de dados publicado no momento. Para solicitar o DPA assinado,
            entre em contato com nosso encarregado de proteção de dados.
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-border">
          <Link
            href={ROUTES.PRIVACY}
            className="text-primary text-sm font-medium hover:underline mr-4"
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
