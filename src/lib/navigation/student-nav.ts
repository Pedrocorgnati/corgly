import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  Library,
  Settings,
  ShoppingCart,
  TrendingUp,
  User,
} from 'lucide-react';

import { ROUTES } from '@/lib/constants/routes';

/**
 * FONTE UNICA DA NAVEGACAO DO ALUNO.
 *
 * As tres superficies de navegacao do aluno (sidebar desktop, drawer mobile e
 * barra inferior mobile) leem DESTE arquivo. Antes existiam tres arrays
 * literais duplicados que ja tinham dessincronizado entre si (a rota /library
 * existia na sidebar e nao existia no drawer).
 *
 * REGRA: item novo de navegacao do aluno entra AQUI e em lugar nenhum mais.
 * Basta declarar o item com o `showIn` correto que ele nasce nas superficies
 * escolhidas, ja com o `data-testid` derivado do href.
 *
 * Ao adicionar um item, confira:
 *  1. a rota existe em `src/lib/constants/routes.ts` (nunca escrever href cru);
 *  2. `labelKey` existe no namespace i18n `sidebar.student` nos 4 locales;
 *  3. se o item aparece na barra inferior, `bottomLabelKey` existe no
 *     namespace `bottomNav` nos 4 locales e `bottomOrder` foi definido.
 */

/** Superficies que renderizam a navegacao do aluno. */
export type StudentNavSurface = 'sidebar' | 'drawer' | 'bottom';

interface StudentNavItemBase {
  /** Rota de destino. Sempre vinda de `ROUTES`, nunca string crua. */
  href: string;
  /** Chave dentro do namespace i18n `sidebar.student` (sidebar + drawer). */
  labelKey: string;
  /** Icone usado na sidebar e no drawer. */
  icon: LucideIcon;
}

/** Item que aparece apenas na sidebar e/ou no drawer. */
export interface StudentNavPanelItem extends StudentNavItemBase {
  showIn: readonly Exclude<StudentNavSurface, 'bottom'>[];
}

/**
 * Item que tambem aparece na barra inferior mobile.
 *
 * A barra inferior usa outro namespace i18n (`bottomNav`), com rotulos mais
 * curtos que os da sidebar ("Inicio" x "Painel"), por isso o rotulo e o icone
 * dela sao declarados separadamente. Declarar `'bottom'` em `showIn` sem
 * `bottomLabelKey`/`bottomOrder` e erro de compilacao — nao existe fallback
 * silencioso para uma chave de traducao inexistente.
 */
export interface StudentNavBottomItem extends StudentNavItemBase {
  showIn: readonly StudentNavSurface[];
  /** Chave dentro do namespace i18n `bottomNav`. */
  bottomLabelKey: string;
  /** Icone alternativo da barra inferior; ausente = reusa `icon`. */
  bottomIcon?: LucideIcon;
  /**
   * Posicao na barra inferior (crescente). A barra tem ordem propria porque e
   * a superficie mais estreita: os primeiros slots priorizam o funil de compra.
   */
  bottomOrder: number;
}

export type StudentNavItem = StudentNavPanelItem | StudentNavBottomItem;

/**
 * Ordem canonica da sidebar e do drawer. A barra inferior reordena por
 * `bottomOrder` e mostra apenas o subconjunto marcado com `'bottom'`.
 */
export const STUDENT_NAV_ITEMS: readonly StudentNavItem[] = [
  {
    href: ROUTES.DASHBOARD,
    labelKey: 'dashboard',
    icon: LayoutDashboard,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'home',
    bottomOrder: 1,
  },
  {
    href: ROUTES.SCHEDULE,
    labelKey: 'schedule',
    icon: CalendarDays,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'schedule',
    bottomOrder: 2,
  },
  {
    href: ROUTES.PROGRESS,
    labelKey: 'progress',
    icon: TrendingUp,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'progress',
    bottomOrder: 4,
  },
  {
    href: ROUTES.EXERCISES,
    labelKey: 'exercises',
    icon: ClipboardList,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'exercises',
    bottomOrder: 5,
  },
  {
    href: ROUTES.HISTORY,
    labelKey: 'history',
    icon: History,
    showIn: ['sidebar', 'drawer'],
  },
  {
    href: ROUTES.LIBRARY,
    labelKey: 'library',
    icon: Library,
    showIn: ['sidebar', 'drawer'],
  },
  {
    href: ROUTES.CREDITS,
    labelKey: 'buy',
    icon: CreditCard,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'buy',
    bottomIcon: ShoppingCart,
    bottomOrder: 3,
  },
  {
    href: ROUTES.ACCOUNT,
    labelKey: 'settings',
    icon: Settings,
    showIn: ['sidebar', 'drawer', 'bottom'],
    bottomLabelKey: 'account',
    bottomIcon: User,
    bottomOrder: 6,
  },
];

/**
 * `showIn` tem tipos diferentes nas duas variantes do item, entao o alargamento
 * fica isolado aqui em vez de espalhar cast por componente.
 */
function showsIn(item: StudentNavItem, surface: StudentNavSurface): boolean {
  return (item.showIn as readonly StudentNavSurface[]).includes(surface);
}

/** Narrowing para os itens que declaram presenca na barra inferior. */
export function isStudentNavBottomItem(item: StudentNavItem): item is StudentNavBottomItem {
  return 'bottomLabelKey' in item;
}

/**
 * Itens da sidebar desktop ou do drawer mobile, na ordem canonica.
 * Rotulo: `useTranslations('sidebar.student')(item.labelKey)`.
 */
export function getStudentNavItems(
  surface: Exclude<StudentNavSurface, 'bottom'>
): StudentNavItem[] {
  return STUDENT_NAV_ITEMS.filter((item) => showsIn(item, surface));
}

/**
 * Abas da barra inferior mobile, ordenadas por `bottomOrder`.
 * Rotulo: `useTranslations('bottomNav')(item.bottomLabelKey)`.
 */
export function getStudentBottomNavItems(): StudentNavBottomItem[] {
  return STUDENT_NAV_ITEMS.filter(
    (item): item is StudentNavBottomItem =>
      isStudentNavBottomItem(item) && showsIn(item, 'bottom')
  ).sort((a, b) => a.bottomOrder - b.bottomOrder);
}

/**
 * Sufixo do `data-testid` derivado do href ('/account/billing' -> 'account-billing').
 * Os tres componentes derivam o testid por aqui para nao divergirem: os nomes
 * `sidebar-nav-item-*`, `sidebar-mobile-nav-item-*` e `mobile-bottom-nav-item-*`
 * sao ancora de teste de outras telas.
 */
export function studentNavSlug(href: string): string {
  return href.replace(/^\//, '').replace(/\//g, '-');
}

/** Marca o item ativo: match exato ou rota filha. */
export function isStudentNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}
