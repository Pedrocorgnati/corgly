'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, CalendarDays, TrendingUp, User, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';

function useTabs() {
  const t = useTranslations('bottomNav');
  return [
    { href: ROUTES.DASHBOARD, label: t('home'), icon: LayoutDashboard },
    { href: ROUTES.SCHEDULE, label: t('schedule'), icon: CalendarDays },
    { href: ROUTES.CREDITS, label: t('buy'), icon: ShoppingCart },
    { href: ROUTES.PROGRESS, label: t('progress'), icon: TrendingUp },
    { href: ROUTES.ACCOUNT, label: t('account'), icon: User },
  ];
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const tabs = useTabs();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm safe-bottom"
      aria-label="Navegação principal"
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] transition-colors duration-[120ms]',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5px]')} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
