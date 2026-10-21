import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import ptBR from '../../../../i18n/messages/pt-BR.json';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/components/landing/language-flags', () => ({ LanguageFlags: () => null }));
vi.mock('@/components/brand/brand-logo', () => ({ BrandLogo: () => null }));

import { PublicHeader } from '@/components/shared/public-header';

function renderHeader() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <PublicHeader />
    </NextIntlClientProvider>,
  );
}

describe('PublicHeader: item Ebooks', () => {
  it('mostra o item no menu desktop apontando para /ebooks', () => {
    renderHeader();
    const item = screen.getByTestId('header-nav-item-ebooks');
    expect(item.getAttribute('href')).toBe('/ebooks');
    expect(item.textContent).toBe('Ebooks');
  });

  it('mostra o item no menu mobile apos abrir', async () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('header-menu-toggle-button'));
    const item = await screen.findByTestId('header-mobile-nav-item-ebooks');
    expect(item.getAttribute('href')).toBe('/ebooks');
  });
});
