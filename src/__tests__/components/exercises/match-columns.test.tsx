import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MatchColumns,
  type MatchPair,
} from '@/components/exercises/match-columns';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const left = [
  { id: 'l1', text: 'one' },
  { id: 'l2', text: 'two' },
  { id: 'l3', text: 'three' },
];
const right = [
  { id: 'r1', text: 'um' },
  { id: 'r2', text: 'dois' },
  { id: 'r3', text: 'três' },
];

function Harness({
  validate,
}: {
  validate: (pair: MatchPair) => Promise<{ isCorrect: boolean }>;
}) {
  const [pairs, setPairs] = useState<MatchPair[]>([]);
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <MatchColumns
        left={left}
        right={right}
        pairs={pairs}
        phase="answering"
        onPairsChange={setPairs}
        onValidatePair={validate}
      />
    </NextIntlClientProvider>
  );
}

describe('MatchColumns com feedback imediato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valida no segundo clique, usa aria-busy e fixa o par correto', async () => {
    const user = userEvent.setup();
    let resolveValidation!: (value: { isCorrect: boolean }) => void;
    const validate = vi.fn(
      () => new Promise<{ isCorrect: boolean }>((resolve) => {
        resolveValidation = resolve;
      }),
    );
    render(<Harness validate={validate} />);

    const one = screen.getByRole('button', { name: 'one' });
    const um = screen.getByRole('button', { name: 'um' });
    await user.click(one);
    await user.click(um);

    expect(validate).toHaveBeenCalledWith({ leftId: 'l1', rightId: 'r1' });
    expect(screen.getByTestId('match-columns')).toHaveAttribute('aria-busy', 'true');
    expect(one).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Validando par');

    resolveValidation({ isCorrect: true });
    await waitFor(() => expect(screen.getByText('1 de 3 pares')).toBeInTheDocument());

    expect(one).toHaveAttribute('aria-disabled', 'true');
    expect(um).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('match-pair-feedback')).toHaveTextContent('par correto');
    expect(one).toHaveAccessibleDescription('Par correto e fixado');
  });

  it('limpa apenas o candidato incorreto e preserva pares corretos', async () => {
    const user = userEvent.setup();
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ isCorrect: true })
      .mockResolvedValueOnce({ isCorrect: false });
    render(<Harness validate={validate} />);

    await user.click(screen.getByRole('button', { name: 'one' }));
    await user.click(screen.getByRole('button', { name: 'um' }));
    await waitFor(() => expect(screen.getByText('1 de 3 pares')).toBeInTheDocument());

    const two = screen.getByRole('button', { name: 'two' });
    const tres = screen.getByRole('button', { name: 'três' });
    await user.click(two);
    await user.click(tres);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('não formam um par'));

    expect(screen.getByText('1 de 3 pares')).toBeInTheDocument();
    expect(screen.getByTestId('match-entry-left-l1')).toHaveAttribute('aria-disabled', 'true');
    expect(two).toHaveAttribute('aria-pressed', 'false');
    expect(tres).toHaveAttribute('aria-pressed', 'false');
  });

  it('preserva o candidato em falha de rede e permite retry', async () => {
    const user = userEvent.setup();
    const validate = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ isCorrect: true });
    render(<Harness validate={validate} />);

    const one = screen.getByRole('button', { name: 'one' });
    const um = screen.getByRole('button', { name: 'um' });
    await user.click(one);
    await user.click(um);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('seleção foi mantida'));

    expect(one).toHaveAttribute('aria-pressed', 'true');
    expect(um).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('1 de 3 pares')).toBeInTheDocument());
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('forma o par com Enter e Espaço sem handlers de drag', async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ isCorrect: true });
    render(<Harness validate={validate} />);

    screen.getByRole('button', { name: 'one' }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'um' }).focus();
    await user.keyboard(' ');

    await waitFor(() => {
      expect(validate).toHaveBeenCalledWith({ leftId: 'l1', rightId: 'r1' });
    });
  });
});
