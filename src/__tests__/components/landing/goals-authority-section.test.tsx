import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { GoalsAuthoritySection } from '@/components/landing/goals-authority-section';
import en from '../../../../i18n/messages/en-US.json';

describe('GoalsAuthoritySection', () => {
  it('renders at least six goal chips', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <GoalsAuthoritySection />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('landing-goals-authority')).toBeInTheDocument();
    expect(screen.getByTestId('landing-goals-chip-zero')).toBeInTheDocument();
    expect(screen.getByTestId('landing-goals-chip-confidence')).toBeInTheDocument();
  });
});
