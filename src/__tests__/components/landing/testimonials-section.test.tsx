import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import en from '../../../../i18n/messages/en-US.json';

describe('TestimonialsSection', () => {
  it('shows featured real names and hides stock names', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <TestimonialsSection />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('landing-testimonials-card-skye')).toBeInTheDocument();
    expect(screen.getByTestId('landing-testimonials-card-jeniffer')).toBeInTheDocument();
    expect(screen.getByTestId('landing-testimonials-card-josep')).toBeInTheDocument();
    expect(screen.queryByText('Maria Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Giulia Rossi')).not.toBeInTheDocument();
    expect(screen.queryByText(/James O/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-testimonials-pagination')).not.toBeInTheDocument();
  });
});
