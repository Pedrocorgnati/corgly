'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
// Fonte unica da navegacao do admin. Item novo entra la, nao aqui.
import {
  adminNavSlug,
  getAdminNavItems,
  isAdminNavItemActive,
} from '@/components/shared/admin-sidebar';
import { useAuth } from '@/hooks/useAuth';

interface MobileAdminDrawerProps {
  user: { name: string; email: string };
  open: boolean;
  onClose: () => void;
}

export function MobileAdminDrawer({ user, open, onClose }: MobileAdminDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tNav = useTranslations('sidebar.admin');
  const navItems = getAdminNavItems('drawer');
  const { logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent data-testid="sidebar-mobile-drawer" side="left" className="w-72 p-0 flex flex-col lg:hidden">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>

        {/* User info + Admin badge */}
        <div data-testid="sidebar-mobile-user-section" className="p-4 border-b border-border mt-10">
          <div className="flex items-center gap-3">
            <AvatarInitials name={user.name} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary text-primary">
                  ADMIN
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav data-testid="sidebar-mobile-nav" aria-label="Navegação do administrador" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, labelKey, icon: Icon }) => {
            const active = isAdminNavItemActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                data-testid={`sidebar-mobile-nav-item-${adminNavSlug(href)}`}
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
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
