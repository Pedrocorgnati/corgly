import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="text-center max-w-sm">
        <p className="text-8xl font-bold text-primary mb-4">404</p>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t('notFound.title')}</h1>
        <p className="text-muted-foreground mb-8">
          {t('notFound.description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={ROUTES.HOME} className={cn(buttonVariants())}>{t('notFound.backHome')}</Link>
          <Link href={ROUTES.DASHBOARD} className={cn(buttonVariants({ variant: 'outline' }))}>{t('notFound.goDashboard')}</Link>
        </div>
      </div>
    </div>
  );
}
