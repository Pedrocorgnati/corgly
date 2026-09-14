import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { AnswerChoices } from '@/components/exercises/answer-choices';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const options = [
  { letter: 'A', text: 'Primeira opção' },
  { letter: 'B', text: 'Segunda opção' },
];

function InteractiveChoices() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <AnswerChoices
        questionId="question-1"
        prompt="Escolha uma opção"
        options={options}
        selected={selected}
        phase="answering"
        onSelect={setSelected}
      />
    </NextIntlClientProvider>
  );
}

describe('AnswerChoices', () => {
  it('mantém alvos de toque de 44 px e seleção por teclado', async () => {
    const user = userEvent.setup();
    render(<InteractiveChoices />);

    expect(screen.getByTestId('exercise-option-0')).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByTestId('exercise-option-1')).toHaveClass('min-h-11', 'min-w-11');

    const firstOption = screen.getByRole('radio', { name: /Alternativa A/i });
    firstOption.focus();
    await user.keyboard(' ');

    expect(firstOption).toBeChecked();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /Alternativa B/i })).toBeChecked();
  });

  it('usa tokens semânticos para acerto e erro depois da conferência', () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <AnswerChoices
          questionId="question-1"
          prompt="Escolha uma opção"
          options={options}
          selected="A"
          phase="checked"
          correctLetter="B"
          onSelect={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('exercise-option-0')).toHaveClass(
      'border-destructive',
      'bg-destructive/10',
    );
    expect(screen.getByTestId('exercise-option-1')).toHaveClass(
      'border-success',
      'bg-success/10',
    );
  });
});
