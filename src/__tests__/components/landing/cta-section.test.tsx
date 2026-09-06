import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CTASection } from '@/components/landing/cta-section';
import en from '../../../../i18n/messages/en-US.json';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
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

describe('CTASection', () => {
  it('has a single primary CTA and no lead form', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <CTASection />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('landing-cta-primary-button')).toHaveAttribute(
      'href',
      '/auth/register?intent=first-lesson',
    );
    expect(screen.queryByText(/Sign up Now/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-lead-landing')).not.toBeInTheDocument();
  });
});
