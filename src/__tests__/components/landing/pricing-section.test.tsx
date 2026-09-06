import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingSection } from '@/components/landing/pricing-section';
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

function renderPricing() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={en}>
      <PricingSection />
    </NextIntlClientProvider>,
  );
}

describe('PricingSection', () => {
  it('renders three plans and not pack 5', () => {
    renderPricing();
    expect(screen.getByTestId('landing-pricing-plan-single')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-plan-pack-10')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-plan-monthly')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-pricing-plan-pack-5')).not.toBeInTheDocument();
    expect(screen.queryByText(/pack 5/i)).not.toBeInTheDocument();
  });

  it('shows first-lesson price and most chosen vs best cost', () => {
    renderPricing();
    expect(screen.getAllByText(/US\$ 12\.5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Most chosen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/best cost per lesson/i).length).toBeGreaterThan(0);
  });

  it('offers monthly 10 at US$ 17 and 20 at US$ 15', () => {
    renderPricing();
    expect(screen.getByTestId('landing-pricing-monthly-option-10')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-monthly-option-20')).toBeInTheDocument();
    expect(screen.getAllByText(/US\$ 17/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 15/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 170/).length).toBeGreaterThan(0);
  });
});
