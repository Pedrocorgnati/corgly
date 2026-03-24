'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Menu, Bell } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { CreditBadge } from '@/components/ui/credit-badge';
import { ThemeToggle } from './theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/lib/constants/enums';

interface AppHeaderProps {
  user: { name: string; email: string; role: UserRole; creditBalance: number };
  onMenuClick?: () => void;
}

export function AppHeader({ user, onMenuClick }: AppHeaderProps) {
  const t = useTranslations('nav');
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        {/* Left: hamburger (mobile/tablet) + logo */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={onMenuClick}
            aria-label={t('aria.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href={isAdmin ? ROUTES.ADMIN_DASHBOARD : ROUTES.DASHBOARD} className="flex items-center gap-2">
            <Image src="/images/logo.svg" alt="Corgly" width={100} height={28} className="dark:hidden" />
            <Image src="/images/logo-dark.svg" alt="Corgly" width={100} height={28} className="hidden dark:block" />
          </Link>
        </div>

        {/* Right: credits (student only) + notifications + avatar + theme */}
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <CreditBadge balance={user.creditBalance} className="hidden sm:inline-flex" />
          )}
          {isAdmin && (
            <Badge variant="outline" className="hidden sm:inline-flex border-primary text-primary text-xs">
              ADMIN
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 relative" aria-label={t('notifications')}>
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
          </Button>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors"
                aria-label={t('aria.userMenu')}
              >
                <AvatarInitials name={user.name} size="sm" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <Link href={ROUTES.ACCOUNT}>{t('settings')}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                {t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
