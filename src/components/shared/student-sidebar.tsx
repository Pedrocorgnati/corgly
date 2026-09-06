'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getStudentNavItems,
  isStudentNavItemActive,
  studentNavSlug,
} from '@/lib/navigation/student-nav';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { CreditBadge } from '@/components/ui/credit-badge';
import { useAuth } from '@/hooks/useAuth';

interface StudentSidebarProps {
  user: { name: string; email: string; creditBalance: number };
}

// Lista de itens: fonte unica em src/lib/navigation/student-nav.ts.
// Item novo entra la, nunca aqui.
const NAV_ITEMS = getStudentNavItems('sidebar');

export function StudentSidebar({ user }: StudentSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tNav = useTranslations('sidebar.student');
  const { logout } = useAuth();

  return (
    <aside data-testid="sidebar" className="hidden lg:flex fixed left-0 top-16 bottom-0 w-60 flex-col border-r border-border bg-card z-30">
      {/* User info */}
      <div data-testid="sidebar-user-section" className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <AvatarInitials name={user.name} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <div className="mt-3">
          <CreditBadge data-testid="sidebar-credit-badge" balance={user.creditBalance} />
        </div>
      </div>

      {/* Navigation */}
      <nav data-testid="sidebar-nav" aria-label="Navegação do estudante" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isStudentNavItemActive(href, pathname);
          const slug = studentNavSlug(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`sidebar-nav-item-${slug}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-[120ms]',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {tNav(labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-border">
        <button
          data-testid="sidebar-logout-button"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-[120ms]"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
