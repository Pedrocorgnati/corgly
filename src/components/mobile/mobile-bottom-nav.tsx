'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  getStudentBottomNavItems,
  isStudentNavItemActive,
  studentNavSlug,
} from '@/lib/navigation/student-nav';

// Lista de abas: fonte unica em src/lib/navigation/student-nav.ts.
// Aba nova entra la (com showIn incluindo 'bottom'), nunca aqui.
const TABS = getStudentBottomNavItems();

export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations('bottomNav');

  return (
    <nav
      data-testid="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm safe-bottom"
      aria-label="Navegação principal"
    >
      <div className="flex items-stretch h-14">
        {TABS.map(({ href, bottomLabelKey, icon, bottomIcon }) => {
          const Icon = bottomIcon ?? icon;
          const active = isStudentNavItemActive(href, pathname);
          const slug = studentNavSlug(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`mobile-bottom-nav-item-${slug}`}
              className={cn(
                'flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-2 min-h-[44px] transition-colors duration-[120ms]',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'stroke-[2.5px]')} />
              {/* truncate: a barra e a superficie mais estreita e ja tem 6 abas */}
              <span className="w-full text-center text-[10px] font-medium leading-tight truncate">
                {t(bottomLabelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
