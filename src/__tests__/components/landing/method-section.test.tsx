import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { MethodSection } from '@/components/landing/method-section';
import pt from '../../../../i18n/messages/pt-BR.json';

function renderMethod() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <MethodSection />
    </NextIntlClientProvider>,
  );
}

describe('MethodSection', () => {
  it('renders four Portuguese pillars and no English jargon titles', () => {
    renderMethod();
    expect(screen.getByText('Compromisso')).toBeInTheDocument();
    expect(screen.getByText('Ciclo fechado')).toBeInTheDocument();
    expect(screen.getByText('Contexto contínuo')).toBeInTheDocument();
    expect(screen.getByText('Feedback de verdade')).toBeInTheDocument();
    expect(screen.queryByText('Time-Boxed')).not.toBeInTheDocument();
    expect(screen.queryByText('Commitment')).not.toBeInTheDocument();
    expect(screen.queryByText('Cycle-Based')).not.toBeInTheDocument();
  });

  it('does not mount a lead form', () => {
    renderMethod();
    expect(screen.queryByTestId('form-lead-method')).not.toBeInTheDocument();
  });
});
