import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ProfessorSection } from '@/components/landing/professor-section';
import en from '../../../../i18n/messages/en-US.json';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt as string} src={props.src as string} />
  ),
}));

describe('ProfessorSection', () => {
  it('renders a real photo not PC initials', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <ProfessorSection />
      </NextIntlClientProvider>,
    );
    const photo = screen.getByTestId('landing-professor-photo');
    expect(photo.querySelector('img')?.getAttribute('src')).toMatch(/professor-pedro/);
    expect(screen.queryByText('PC')).not.toBeInTheDocument();
    expect(screen.queryByText(/420/)).not.toBeInTheDocument();
    expect(screen.queryByText(/University of São Paulo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/postgraduate in teaching methodology/i)).toBeInTheDocument();
  });
});
