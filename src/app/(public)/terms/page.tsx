import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  description: 'Leia os termos de uso e condições da plataforma Corgly. Entenda seus direitos, responsabilidades e as regras para usar nossos serviços de aulas de português.',
  title: 'Termos de Uso',
};

const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] as const;

export default async function TermsPage() {
  const t = await getTranslations('terms');

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('lastUpdated')}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">
          {SECTIONS.map((key) => (
            <section key={key}>
              <h2 className="text-xl font-semibold mb-3">{t(`${key}Title`)}</h2>
              <p className="text-muted-foreground leading-relaxed">{t(`${key}Text`)}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <Link href={ROUTES.PRIVACY} className="text-primary text-sm font-medium hover:underline mr-4">
            {t('linkPrivacy')}
          </Link>
          <Link href={ROUTES.HOME} className="text-muted-foreground text-sm hover:underline">
            &larr; {t('linkBack')}
          </Link>
        </div>
      </div>
    </div>
  );
}
