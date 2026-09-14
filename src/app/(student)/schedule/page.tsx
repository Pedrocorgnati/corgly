import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarSchedule } from '@/components/student/calendar-schedule';
import { PageWrapper } from '@/components/shared';
import { getAuthUser } from '@/lib/data/auth';
import { ROUTES } from '@/lib/constants/routes';
import { getCanonicalTimezone } from '@/lib/canonical-timezone';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.schedule');
  return { title: t('metaTitle') };
}

export default async function SchedulePage() {
  const user = await getAuthUser();
  if (!user) redirect(ROUTES.LOGIN);
  // Idioma resolvido no servidor (i18n/request.ts). Ate 2026-09-07 esta pagina
  // escrevia portugues cravado e ignorava o idioma escolhido pelo aluno.
  const [t, adminTimezone] = await Promise.all([
    getTranslations('pages.schedule'),
    getCanonicalTimezone(),
  ]);

  return (
    <PageWrapper data-testid="page-schedule" className="max-w-5xl">
      <div data-testid="schedule-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('timezone', { timezone: user.timezone })}
        </p>
      </div>
      {/*
        Saldo e fuso chegam validados por getAuthUser. A pagina nao cria
        fallbacks locais: sem sessao, o redirect acima encerra o render.
      */}
      <CalendarSchedule
        creditBalance={user.creditBalance}
        studentTimezone={user.timezone}
        adminTimezone={adminTimezone}
      />
    </PageWrapper>
  );
}
