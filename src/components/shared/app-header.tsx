'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/brand/brand-logo';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { CreditBadge } from '@/components/ui/credit-badge';
import { ThemeToggle } from './theme-toggle';
import { LanguageFlags } from '@/components/landing/language-flags';
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
import { useAuth } from '@/hooks/useAuth';

interface AppHeaderProps {
  user: { name: string; email: string; role: UserRole; creditBalance: number };
  onMenuClick: () => void;
}

export function AppHeader({ user, onMenuClick }: AppHeaderProps) {
  const t = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const { logout } = useAuth();
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <header data-testid="header" className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        {/* Left: hamburger (mobile/tablet) + logo */}
        <div data-testid="header-logo" className="flex items-center gap-3">
          <Button
            data-testid="header-menu-toggle-button"
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={onMenuClick}
            aria-label={t('aria.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href={isAdmin ? ROUTES.ADMIN_DASHBOARD : ROUTES.DASHBOARD} className="flex items-center gap-2">
            <BrandLogo variant="dark" className="dark:hidden" />
            <BrandLogo variant="light" className="hidden dark:inline-flex" />
          </Link>
        </div>

        {/* Right: credits (student only) + language + avatar + theme */}
        <div data-testid="header-actions" className="flex items-center gap-2">
          {!isAdmin && (
            <CreditBadge data-testid="header-credit-badge" balance={user.creditBalance} className="hidden sm:inline-flex" />
          )}
          {isAdmin && (
            <Badge data-testid="header-admin-badge" variant="outline" className="hidden sm:inline-flex border-primary text-primary text-xs">
              ADMIN
            </Badge>
          )}
          <LanguageFlags />
          <ThemeToggle data-testid="header-theme-toggle-button" />
          <DropdownMenu>
            {/* Sem `render`, o <button> interno viraria <button> dentro do
                <button> do Trigger (HTML invalido -> hydration mismatch). */}
            <DropdownMenuTrigger
              data-testid="header-user-menu-button"
              className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors"
              aria-label={t('aria.userMenu')}
            >
              <AvatarInitials name={user.name} size="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent data-testid="header-user-menu" align="end" className="w-56">
              {/* Cabecalho do menu. `DropdownMenuLabel` e um <div> puro de
                  proposito — ver a nota em src/components/ui/dropdown-menu.tsx. */}
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/*
                Destinos REAIS, por papel. `/account` so existe na area do aluno
                (o layout de (student) devolve o ADMIN para /admin/dashboard), e
                a unica pagina de conta do admin e /admin/account/security.
                `render={<Link/>}` faz o proprio item virar o <a>: aninhar um
                <Link> dentro do item punha um interativo dentro de outro, e o
                clique no meio do item nao navegava.
              */}
              {isAdmin ? (
                <DropdownMenuItem
                  data-testid="header-user-menu-security-item"
                  className="cursor-pointer"
                  render={<Link href={ROUTES.ADMIN_ACCOUNT_SECURITY} />}
                >
                  {tSidebar('admin.security')}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    data-testid="header-user-menu-profile-item"
                    className="cursor-pointer"
                    render={<Link href={ROUTES.ACCOUNT} />}
                  >
                    {t('profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="header-user-menu-billing-item"
                    className="cursor-pointer"
                    render={<Link href={ROUTES.ACCOUNT_BILLING} />}
                  >
                    {t('billing')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {/* Zero Orfaos: o item de sair tinha texto e nenhum handler. */}
              <DropdownMenuItem
                data-testid="header-user-menu-logout-item"
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => logout()}
              >
                {t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
