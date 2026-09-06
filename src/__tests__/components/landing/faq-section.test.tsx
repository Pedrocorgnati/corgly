import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { FAQSection } from '@/components/landing/faq-section';
import en from '../../../../i18n/messages/en-US.json';

describe('FAQSection', () => {
  it('has a single duration answer of 50 minutes and Zoom', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <FAQSection />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('landing-faq-item-duration')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-faq-item-how-it-works')).not.toBeInTheDocument();
    expect(screen.getByText(/50 minutes/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('landing-faq-item-platform-trigger'));
    expect(await screen.findByText(/Live on Zoom/i)).toBeInTheDocument();
  });
});
