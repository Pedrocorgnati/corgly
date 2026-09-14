import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsufficientCreditsGate } from '@/components/credits/InsufficientCreditsGate';
import { render } from '@/test/utils';

describe('InsufficientCreditsGate', () => {
  it('leva o aluno sem saldo para a vitrine canonica de creditos', () => {
    render(
      <InsufficientCreditsGate balance={0}>
        <span data-testid="conteudo-protegido">Agendamento</span>
      </InsufficientCreditsGate>,
    );

    expect(screen.getByTestId('insufficient-credits-buy-link')).toHaveAttribute(
      'href',
      '/credits',
    );
    expect(screen.queryByTestId('conteudo-protegido')).not.toBeInTheDocument();
  });

  it('libera o fluxo quando existe saldo', () => {
    render(
      <InsufficientCreditsGate balance={1}>
        <span data-testid="conteudo-protegido">Agendamento</span>
      </InsufficientCreditsGate>,
    );

    expect(screen.getByTestId('conteudo-protegido')).toBeInTheDocument();
    expect(screen.queryByTestId('insufficient-credits-buy-link')).not.toBeInTheDocument();
  });
});
