import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import en from '../../../../i18n/messages/en-US.json';

describe('HowItWorksSection', () => {
  it('renders four Zoom-aware steps', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <HowItWorksSection />
      </NextIntlClientProvider>,
    );
    expect(document.getElementById('como-funciona')).toBeTruthy();
    expect(screen.getByTestId('landing-how-it-works-step-01')).toBeInTheDocument();
    expect(screen.getByTestId('landing-how-it-works-step-04')).toBeInTheDocument();
    expect(screen.getAllByText(/Zoom/).length).toBeGreaterThan(0);
  });
});
