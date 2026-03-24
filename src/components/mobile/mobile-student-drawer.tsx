'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, CalendarDays, TrendingUp, History, CreditCard, Settings, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { CreditBadge } from '@/components/ui/credit-badge';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

interface MobileStudentDrawerProps {
  user: { name: string; email: string; creditBalance: number };
  open: boolean;
  onClose: () => void;
}

function useNavItems() {
  const t = useTranslations('sidebar.student');
  return [
    { href: ROUTES.DASHBOARD, label: t('dashboard'), icon: LayoutDashboard },
    { href: ROUTES.SCHEDULE, label: t('schedule'), icon: CalendarDays },
    { href: ROUTES.PROGRESS, label: t('progress'), icon: TrendingUp },
    { href: '/history', label: t('history'), icon: History },
    { href: ROUTES.CREDITS, label: t('buy'), icon: CreditCard },
    { href: ROUTES.ACCOUNT, label: t('settings'), icon: Settings },
  ];
}

export function MobileStudentDrawer({ user, open, onClose }: MobileStudentDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const navItems = useNavItems();
  const { logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col lg:hidden">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>

        {/* User info */}
        <div className="p-4 border-b border-border mt-10">
          <div className="flex items-center gap-3">
            <AvatarInitials name={user.name} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <div className="mt-3">
            <CreditBadge balance={user.creditBalance} />
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Navegação do estudante" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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
