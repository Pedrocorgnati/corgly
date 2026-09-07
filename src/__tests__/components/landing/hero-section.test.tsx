import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { HeroSection } from '@/components/landing/hero-section';
import en from '../../../../i18n/messages/en-US.json';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt as string} src={props.src as string} />
  ),
}));

// Router mockado: o CTA adia a navegacao do clique dado durante a sondagem de
// sessao e empurra o destino final quando ela responde.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Estado de sessao mutavel por teste (`useAuth` tem tres estados).
const auth = vi.hoisted(() => ({
  state: { isAuthenticated: false, isLoading: false },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    role: null,
    isAuthenticated: auth.state.isAuthenticated,
    isLoading: auth.state.isLoading,
    login: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
}));

function renderHero() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={en}>
      <HeroSection />
    </NextIntlClientProvider>,
  );
}

const HERO_CTA = 'landing-hero-cta-primary-button';

beforeEach(() => {
  auth.state = { isAuthenticated: false, isLoading: false };
  router.push.mockClear();
});

describe('HeroSection', () => {
  it('uses the real hero photo and 50 min overlay', () => {
    renderHero();
    const images = screen.getAllByRole('img');
    expect(images.some((img) => img.getAttribute('src')?.includes('hero-pedro'))).toBe(true);
    expect(screen.getByTestId('landing-hero-overlay')).toHaveTextContent(/50 min/);
    expect(screen.getByTestId('landing-hero-overlay')).toHaveTextContent(/Next lesson/);
  });

  it('renders three proof pills', () => {
    renderHero();
    expect(screen.getByTestId('landing-hero-proof-countries')).toBeInTheDocument();
    expect(screen.getByTestId('landing-hero-proof-duration')).toBeInTheDocument();
    expect(screen.getByTestId('landing-hero-proof-feedback')).toBeInTheDocument();
  });

  it('visitante leva o plano da primeira aula (SINGLE) para o cadastro', () => {
    renderHero();
    expect(screen.getByTestId(HERO_CTA)).toHaveAttribute(
      'href',
      '/auth/register?intent=first-lesson&plan=SINGLE',
    );
  });

  it('aluno autenticado vai direto para a vitrine com o plano avulso', () => {
    auth.state = { isAuthenticated: true, isLoading: false };
    renderHero();
    expect(screen.getByTestId(HERO_CTA)).toHaveAttribute('href', '/credits?plan=SINGLE');
  });

  it('durante a sondagem de sessao o CTA continua sendo link util e anuncia a espera', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    renderHero();

    const cta = screen.getByTestId(HERO_CTA);
    // Sem JavaScript a hidratacao nunca acontece: um botao desabilitado ficaria
    // sem saida para sempre. O CTA segue link, apontando para o funil publico.
    expect(cta.tagName).toBe('A');
    expect(cta).toHaveAttribute('href', '/auth/register?intent=first-lesson&plan=SINGLE');
    expect(cta).toHaveAttribute('aria-busy', 'true');
    expect(cta).toHaveAttribute('data-state', 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  });

  it('clique durante a espera nao manda aluno logado para o cadastro', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    const { rerender } = renderHero();

    fireEvent.click(screen.getByTestId(HERO_CTA));
    // Destino ainda desconhecido: nada de navegar.
    expect(router.push).not.toHaveBeenCalled();

    auth.state = { isAuthenticated: true, isLoading: false };
    rerender(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <HeroSection />
      </NextIntlClientProvider>,
    );

    expect(router.push).toHaveBeenCalledWith('/credits?plan=SINGLE');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not use create-account copy', () => {
    renderHero();
    expect(screen.queryByText(/Sign up for Free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Criar Conta/i)).not.toBeInTheDocument();
  });
});
