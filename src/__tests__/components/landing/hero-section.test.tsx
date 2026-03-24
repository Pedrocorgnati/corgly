import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { HeroSection } from '@/components/landing/hero-section';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...filterMotionProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function filterMotionProps(props: Record<string, unknown>) {
  const motionKeys = ['variants', 'initial', 'animate', 'exit', 'whileHover', 'whileTap', 'transition'];
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!motionKeys.includes(k)) filtered[k] = v;
  }
  return filtered;
}

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt as string} src={props.src as string} />
  ),
}));

const messages = {
  landing: {
    hero: {
      first_lesson_badge: 'Primeira aula gratis',
      title: 'Aprenda Portugues Brasileiro',
      subtitle: 'Com professor nativo',
      cta_primary: 'Comece Agora',
      cta_primary_aria: 'Ir para cadastro',
      cta_secondary: 'Ver Precos',
      cta_secondary_aria: 'Ir para precos',
      professor_alt: 'Pedro Corgnati',
      professor_name: 'Pedro Corgnati',
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <HeroSection />
    </NextIntlClientProvider>
  );
}

describe('HeroSection', () => {
  it('renderiza com titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Aprenda Portugues Brasileiro')).toBeInTheDocument();
    expect(screen.getByText('Com professor nativo')).toBeInTheDocument();
  });

  it('renderiza badge da primeira aula', () => {
    renderWithI18n();

    expect(screen.getByText('Primeira aula gratis')).toBeInTheDocument();
  });

  it('renderiza CTA primario e secundario', () => {
    renderWithI18n();

    expect(screen.getByText('Comece Agora')).toBeInTheDocument();
    expect(screen.getByText('Ver Precos')).toBeInTheDocument();
  });

  it('possui aria-labelledby apontando para o heading', () => {
    renderWithI18n();

    const section = screen.getByRole('region', { name: 'Aprenda Portugues Brasileiro' });
    expect(section).toBeInTheDocument();
  });

  it('renderiza imagem do professor com alt text', () => {
    renderWithI18n();

    expect(screen.getByAltText('Pedro Corgnati')).toBeInTheDocument();
  });

  it('CTA primario aponta para pagina de registro', () => {
    renderWithI18n();

    const registerLink = screen.getByLabelText('Ir para cadastro');
    expect(registerLink).toHaveAttribute('href', '/auth/register');
  });

  it('CTA secundario aponta para ancora de precos', () => {
    renderWithI18n();

    const pricingLink = screen.getByLabelText('Ir para precos');
    expect(pricingLink).toHaveAttribute('href', '#precos');
  });
});
