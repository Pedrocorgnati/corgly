'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, CalendarDays, Users, Video, CreditCard, BarChart3, BookOpen, Mail, LifeBuoy, ShieldCheck, Activity, LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';

/**
 * FONTE UNICA DA NAVEGACAO DO ADMIN.
 *
 * Gemeo de `src/lib/navigation/student-nav.ts` para as superficies do admin
 * (sidebar desktop e drawer mobile). Antes existiam dois arrays literais
 * duplicados que ja tinham dessincronizado: o drawer nao listava
 * `/admin/emails/templates` nem `/admin/health`, e nao havia motivo declarado
 * para o admin no celular perder duas telas — era so drift.
 *
 * O modulo do aluno nao foi reaproveitado porque ele e especifico daquela area:
 * traduz em `sidebar.student`, tem a barra inferior mobile com outro namespace
 * (`bottomNav`) e ordem propria. O admin nao tem barra inferior.
 *
 * REGRA: item novo de navegacao do admin entra AQUI e em lugar nenhum mais.
 * Ao adicionar um item, confira:
 *  1. a rota existe em `src/lib/constants/routes.ts` (nunca href cru);
 *  2. `labelKey` existe no namespace i18n `sidebar.admin` nos 4 locales.
 */

/** Superficies que renderizam a navegacao do admin. */
export type AdminNavSurface = 'sidebar' | 'drawer';

export interface AdminNavItem {
  /** Rota de destino. Sempre vinda de `ROUTES`, nunca string crua. */
  href: string;
  /** Chave dentro do namespace i18n `sidebar.admin`. */
  labelKey: string;
  icon: LucideIcon;
  showIn: readonly AdminNavSurface[];
}

/** Ordem canonica das duas superficies do admin. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: ROUTES.ADMIN_DASHBOARD, labelKey: 'dashboard', icon: LayoutDashboard, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_SCHEDULE, labelKey: 'schedule', icon: CalendarDays, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_STUDENTS, labelKey: 'students', icon: Users, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_SESSIONS, labelKey: 'sessions', icon: Video, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_CREDITS, labelKey: 'credits', icon: CreditCard, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_REPORTS, labelKey: 'reports', icon: BarChart3, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_CONTENT, labelKey: 'content', icon: BookOpen, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_EMAIL_TEMPLATES, labelKey: 'emailTemplates', icon: Mail, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_SUPPORT, labelKey: 'support', icon: LifeBuoy, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_HEALTH, labelKey: 'health', icon: Activity, showIn: ['sidebar', 'drawer'] },
  { href: ROUTES.ADMIN_ACCOUNT_SECURITY, labelKey: 'security', icon: ShieldCheck, showIn: ['sidebar', 'drawer'] },
];

/** Itens de uma superficie, na ordem canonica. */
export function getAdminNavItems(surface: AdminNavSurface): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.showIn.includes(surface));
}

/**
 * Sufixo do `data-testid` derivado do href ('/admin/schedule' -> 'admin-schedule').
 * As duas superficies derivam o testid por aqui para nao divergirem: os nomes
 * `sidebar-nav-item-*` e `sidebar-mobile-nav-item-*` sao ancora de teste.
 */
export function adminNavSlug(href: string): string {
  return href.replace(/^\//, '').replace(/\//g, '-');
}

/** Marca o item ativo: match exato ou rota filha. */
export function isAdminNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

interface AdminSidebarProps {
  user: { name: string; email: string };
}

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tNav = useTranslations('sidebar.admin');
  const navItems = getAdminNavItems('sidebar');
  const { logout } = useAuth();

  return (
    <aside data-testid="sidebar" className="hidden lg:flex fixed left-0 top-16 bottom-0 w-60 flex-col border-r border-border bg-card z-30">
      {/* User info + Admin badge */}
      <div data-testid="sidebar-user-section" className="p-4 border-b border-border">
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
      <nav data-testid="sidebar-nav" aria-label="Navegação do administrador" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const active = isAdminNavItemActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`sidebar-nav-item-${adminNavSlug(href)}`}
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
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
