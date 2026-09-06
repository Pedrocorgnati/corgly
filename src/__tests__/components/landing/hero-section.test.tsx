import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    isLoading: false,
    role: null,
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

  it('primary CTA goes to register with first-lesson intent', () => {
    renderHero();
    expect(screen.getByTestId('landing-hero-cta-primary-button')).toHaveAttribute(
      'href',
      '/auth/register?intent=first-lesson',
    );
  });

  it('does not use create-account copy', () => {
    renderHero();
    expect(screen.queryByText(/Sign up for Free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Criar Conta/i)).not.toBeInTheDocument();
  });
});
