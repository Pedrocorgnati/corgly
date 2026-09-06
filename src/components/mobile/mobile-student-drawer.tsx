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
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

interface MobileStudentDrawerProps {
  user: { name: string; email: string; creditBalance: number };
  open: boolean;
  onClose: () => void;
}

// Lista de itens: fonte unica em src/lib/navigation/student-nav.ts.
// Item novo entra la, nunca aqui.
const NAV_ITEMS = getStudentNavItems('drawer');

export function MobileStudentDrawer({ user, open, onClose }: MobileStudentDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tNav = useTranslations('sidebar.student');
  const { logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent data-testid="sidebar-mobile-drawer" side="left" className="w-72 p-0 flex flex-col lg:hidden">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>

        {/* User info */}
        <div data-testid="sidebar-mobile-user-section" className="p-4 border-b border-border mt-10">
          <div className="flex items-center gap-3">
            <AvatarInitials name={user.name} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <div className="mt-3">
            <CreditBadge data-testid="sidebar-mobile-credit-badge" balance={user.creditBalance} />
          </div>
        </div>

        {/* Navigation */}
        <nav data-testid="sidebar-mobile-nav" aria-label="Navegação do estudante" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active = isStudentNavItemActive(href, pathname);
            const slug = studentNavSlug(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                data-testid={`sidebar-mobile-nav-item-${slug}`}
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
            data-testid="sidebar-mobile-logout-button"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-[120ms]"
            onClick={() => { logout(); onClose(); }}
          >
            <LogOut className="h-4 w-4" />
            {t('logout')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
