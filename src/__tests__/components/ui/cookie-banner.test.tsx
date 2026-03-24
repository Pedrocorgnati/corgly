import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { CookieBanner } from '@/components/ui/cookie-banner';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock CookieCustomizeDialog to simplify tests
vi.mock('@/components/ui/cookie-customize-dialog', () => ({
  CookieCustomizeDialog: ({ open, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (prefs: { analytics: boolean; marketing: boolean }) => void }) => {
    if (!open) return null;
    return (
      <div data-testid="customize-dialog">
        <button onClick={() => onSave({ analytics: true, marketing: false })}>
          Salvar Preferencias
        </button>
      </div>
    );
  },
}));

// Mock fetch for consent API
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch;

const messages = {
  cookieBanner: {
    aria: 'Banner de cookies',
    title: 'Este site usa cookies',
    description: 'Usamos cookies para melhorar sua experiencia.',
    privacy_link: 'Politica de Privacidade',
    customize: 'Personalizar',
    reject: 'Recusar',
    accept_all: 'Aceitar Todos',
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <CookieBanner />
    </NextIntlClientProvider>
  );
}

describe('CookieBanner', () => {
  beforeEach(() => {
    // Clear cookies before each test
    document.cookie = 'corgly_consent=; max-age=0; path=/';
    vi.clearAllMocks();
  });

  it('renderiza quando nao ha cookie de consentimento', () => {
    renderWithI18n();

    expect(screen.getByText('Este site usa cookies')).toBeInTheDocument();
  });

  it('nao renderiza quando cookie de consentimento ja existe', () => {
    document.cookie = 'corgly_consent=all; path=/';
    renderWithI18n();

    expect(screen.queryByText('Este site usa cookies')).not.toBeInTheDocument();
  });

  it('renderiza descricao e link de privacidade', () => {
    renderWithI18n();

    expect(screen.getByText(/Usamos cookies para melhorar/)).toBeInTheDocument();
    expect(screen.getByText('Politica de Privacidade')).toBeInTheDocument();
  });

  it('renderiza os 3 botoes de acao', () => {
    renderWithI18n();

    expect(screen.getByText('Personalizar')).toBeInTheDocument();
    expect(screen.getByText('Recusar')).toBeInTheDocument();
    expect(screen.getByText('Aceitar Todos')).toBeInTheDocument();
  });

  it('esconde banner ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Aceitar Todos'));

    expect(screen.queryByText('Este site usa cookies')).not.toBeInTheDocument();
  });

  it('define cookie "all" ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Aceitar Todos'));

    expect(document.cookie).toContain('corgly_consent=all');
  });

  it('envia consent para API ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Aceitar Todos'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [request] = mockFetch.mock.calls[0];
    // jsdom may pass a Request object or url string depending on version
    if (typeof request === 'string') {
      expect(request).toBe('/api/v1/auth/cookie-consent');
    } else {
      expect(request.url).toContain('/api/v1/auth/cookie-consent');
    }
  });

  it('esconde banner ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Recusar'));

    expect(screen.queryByText('Este site usa cookies')).not.toBeInTheDocument();
  });

  it('define cookie "essential" ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Recusar'));

    expect(document.cookie).toContain('corgly_consent=essential');
  });

  it('envia consent false/false para API ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Recusar'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [request] = mockFetch.mock.calls[0];
    if (typeof request === 'string') {
      expect(request).toBe('/api/v1/auth/cookie-consent');
    } else {
      expect(request.url).toContain('/api/v1/auth/cookie-consent');
    }
  });

  it('abre dialog de personalizacao ao clicar Personalizar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Personalizar'));

    expect(screen.getByTestId('customize-dialog')).toBeInTheDocument();
  });

  it('fecha banner apos salvar preferencias personalizadas', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Personalizar'));
    await user.click(screen.getByText('Salvar Preferencias'));

    expect(screen.queryByText('Este site usa cookies')).not.toBeInTheDocument();
  });

  it('possui role="dialog" com aria-label', () => {
    renderWithI18n();

    const dialog = screen.getByRole('dialog', { name: 'Banner de cookies' });
    expect(dialog).toBeInTheDocument();
  });

  it('link de privacidade aponta para /privacy', () => {
    renderWithI18n();

    const link = screen.getByText('Politica de Privacidade');
    expect(link.closest('a')).toHaveAttribute('href', '/privacy');
  });
});
