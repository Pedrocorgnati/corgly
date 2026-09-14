import { createElement, forwardRef, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/components/shared/app-header';
import { UserRole } from '@/lib/constants/enums';

const logout = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, ComponentProps<'a'>>(
    function MockNextLink({ href, children, ...props }, ref) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      );
    },
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: (namespace: string) => (key: string) => {
    const messages: Record<string, string> = {
      'nav.aria.openMenu': 'Abrir menu',
      'nav.aria.userMenu': 'Menu do usuário',
      'nav.notifications': 'Notificações',
      'nav.profile': 'Perfil',
      'nav.billing': 'Cobrança',
      'nav.logout': 'Sair',
      'sidebar.admin.security': 'Segurança',
    };

    return messages[`${namespace}.${key}`] ?? key;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => createElement('img', { alt, ...props }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/useLandingLocale', () => ({
  useLandingLocale: () => ({ locale: 'pt-BR', setLocale: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { patch: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ logout }),
}));

vi.mock('@/components/brand/brand-logo', () => ({
  BrandLogo: ({ className }: { className?: string }) => (
    <span className={className}>Corgly</span>
  ),
}));

const student = {
  name: 'Ana Souza',
  email: 'ana@example.com',
  role: UserRole.STUDENT,
  creditBalance: 12,
};

describe('AppHeader', () => {
  beforeEach(() => {
    logout.mockReset();
  });

  it('não renderiza o sino, a bolinha ou um tab stop de notificações', async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    const { container } = render(<AppHeader user={student} onMenuClick={onMenuClick} />);

    expect(screen.queryByTestId('header-notification-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notificações' })).not.toBeInTheDocument();
    expect(container.querySelector('.lucide-bell')).toBeNull();

    const menuButton = screen.getByTestId('header-menu-toggle-button');
    const homeLink = screen.getByRole('link', { name: /Corgly/i });
    const languageButtons = screen.getAllByRole('radio');
    const themeButton = screen.getByTestId('header-theme-toggle-button');
    const userMenuButton = screen.getByTestId('header-user-menu-button');

    await user.tab();
    expect(menuButton).toHaveFocus();
    await user.tab();
    expect(homeLink).toHaveFocus();
    for (const languageButton of languageButtons) {
      await user.tab();
      expect(languageButton).toHaveFocus();
      expect(languageButton).toHaveAccessibleName();
    }
    await user.tab();
    expect(themeButton).toHaveFocus();
    await user.tab();
    expect(userMenuButton).toHaveFocus();

    fireEvent.click(menuButton);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('preserva controles remanescentes com nome acessível e ações reais', async () => {
    const user = userEvent.setup();
    render(<AppHeader user={student} onMenuClick={vi.fn()} />);

    const actions = screen.getByTestId('header-actions');
    const interactiveControls = [
      ...within(actions).getAllByRole('button'),
      ...within(actions).queryAllByRole('link'),
    ];
    for (const control of interactiveControls) {
      expect(control).toHaveAccessibleName();
    }

    expect(screen.getByTestId('header-credit-badge')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Corgly/i })).toHaveAttribute('href', '/dashboard');

    fireEvent.mouseDown(screen.getByTestId('header-user-menu-button'), { button: 0 });
    expect(await screen.findByTestId('header-user-menu-profile-item')).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByTestId('header-user-menu-billing-item')).toHaveAttribute(
      'href',
      '/account/billing',
    );

    await user.click(screen.getByTestId('header-user-menu-logout-item'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('preserva a identidade e o destino do header administrativo', async () => {
    render(
      <AppHeader
        user={{ ...student, role: UserRole.ADMIN }}
        onMenuClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('header-admin-badge')).toHaveTextContent('ADMIN');
    expect(screen.queryByTestId('header-credit-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Corgly/i })).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    fireEvent.mouseDown(screen.getByTestId('header-user-menu-button'), { button: 0 });
    expect(await screen.findByTestId('header-user-menu-security-item')).toHaveTextContent('Segurança');
    expect(screen.getByTestId('header-user-menu-security-item')).toHaveAttribute(
      'href',
      '/admin/account/security',
    );
  });
});
