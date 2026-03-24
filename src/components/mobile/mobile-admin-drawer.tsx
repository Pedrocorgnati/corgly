'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, CalendarDays, Users, Video, CreditCard, BarChart3, BookOpen, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

interface MobileAdminDrawerProps {
  user: { name: string; email: string };
  open: boolean;
  onClose: () => void;
}

function useNavItems() {
  const t = useTranslations('sidebar.admin');
  return [
    { href: ROUTES.ADMIN_DASHBOARD, label: t('dashboard'), icon: LayoutDashboard },
    { href: ROUTES.ADMIN_SCHEDULE, label: t('schedule'), icon: CalendarDays },
    { href: ROUTES.ADMIN_STUDENTS, label: t('students'), icon: Users },
    { href: ROUTES.ADMIN_SESSIONS, label: t('sessions'), icon: Video },
    { href: ROUTES.ADMIN_CREDITS, label: t('credits'), icon: CreditCard },
    { href: ROUTES.ADMIN_REPORTS, label: t('reports'), icon: BarChart3 },
    { href: ROUTES.ADMIN_CONTENT, label: t('content'), icon: BookOpen },
  ];
}

export function MobileAdminDrawer({ user, open, onClose }: MobileAdminDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const navItems = useNavItems();
  const { logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col lg:hidden">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>

        {/* User info + Admin badge */}
        <div className="p-4 border-b border-border mt-10">
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
        <nav aria-label="Navegação do administrador" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-[120ms]',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-border">
          <button
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
