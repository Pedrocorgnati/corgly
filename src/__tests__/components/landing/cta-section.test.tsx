import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CTASection } from '@/components/landing/cta-section';
import en from '../../../../i18n/messages/en-US.json';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
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

function renderCta() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={en}>
      <CTASection />
    </NextIntlClientProvider>,
  );
}

const CTA = 'landing-cta-primary-button';

beforeEach(() => {
  auth.state = { isAuthenticated: false, isLoading: false };
  router.push.mockClear();
});

describe('CTASection', () => {
  // `firstLessonHref` delega para `planHref(_, 'SINGLE')`: a primeira aula
  // promocional e uma aula avulsa, entao a escolha viaja junto do `intent`.
  it('has a single primary CTA and no lead form', () => {
    renderCta();
    expect(screen.getByTestId(CTA)).toHaveAttribute(
      'href',
      '/auth/register?intent=first-lesson&plan=SINGLE',
    );
    expect(screen.queryByText(/Sign up Now/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-lead-landing')).not.toBeInTheDocument();
  });

  it('aluno autenticado vai direto para a vitrine com o plano avulso', () => {
    auth.state = { isAuthenticated: true, isLoading: false };
    renderCta();
    expect(screen.getByTestId(CTA)).toHaveAttribute('href', '/credits?plan=SINGLE');
  });

  it('durante a sondagem de sessao o CTA continua sendo link util e anuncia a espera', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    renderCta();

    const cta = screen.getByTestId(CTA);
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
    const { rerender } = renderCta();

    fireEvent.click(screen.getByTestId(CTA));
    // Destino ainda desconhecido: nada de navegar.
    expect(router.push).not.toHaveBeenCalled();

    auth.state = { isAuthenticated: true, isLoading: false };
    rerender(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <CTASection />
      </NextIntlClientProvider>,
    );

    expect(router.push).toHaveBeenCalledWith('/credits?plan=SINGLE');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
