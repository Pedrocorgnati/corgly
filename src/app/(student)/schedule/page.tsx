import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarSchedule } from '@/components/student/calendar-schedule';
import { PageWrapper } from '@/components/shared';
import { getAuthUser } from '@/lib/data/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.schedule');
  return { title: t('metaTitle') };
}

export default async function SchedulePage() {
  const user = await getAuthUser();
  // Idioma resolvido no servidor (i18n/request.ts). Ate 2026-09-07 esta pagina
  // escrevia portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = await getTranslations('pages.schedule');

  return (
    <PageWrapper data-testid="page-schedule" className="max-w-5xl">
      <div data-testid="schedule-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('timezone', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
        </p>
      </div>
      {/*
        `creditBalance` vem validado de /api/v1/auth/me (CreditService.getBalance).
        O `?? 0` cobre apenas o caso `user === null` (sem sessao), que o layout
        de (student) ja intercepta com redirect para o login — nao e mais um
        fallback para "campo ausente no contrato".
      */}
      <CalendarSchedule creditBalance={user?.creditBalance ?? 0} />
    </PageWrapper>
  );
}
