import fs from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ptBR from '../../../../i18n/messages/pt-BR.json';
import { ExerciseCard, type ExerciseCardProps } from '@/components/exercises/exercise-card';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: PropsWithChildren<ComponentProps<'a'>>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const EXERCISE_ID = 'exercise-123';

const baseProps: ExerciseCardProps = {
  exerciseId: EXERCISE_ID,
  title: 'Presente do indicativo',
  supportLanguage: 'PT_BR',
  level: 2,
  subject: 'Gramática',
  isNew: false,
  status: 'NOT_STARTED',
  itemCount: 4,
  predominantKind: 'MULTIPLE_CHOICE',
  progress: null,
};

function renderCard(overrides: Partial<ExerciseCardProps> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <ExerciseCard {...baseProps} {...overrides} />
    </NextIntlClientProvider>,
  );
}

describe('ExerciseCard', () => {
  it.each([
    'MULTIPLE_CHOICE',
    'MATCH_CLICK',
    'TEXT_CHOICE',
    'VERB_CLOZE',
  ] as const)('renderiza o ícone decorativo próprio de %s', (kind) => {
    renderCard({ predominantKind: kind });

    const icon = screen.getByTestId(`exercise-kind-icon-${kind}`);
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['NOT_STARTED', 'Não iniciado'],
    ['IN_PROGRESS', 'Em andamento'],
    ['COMPLETED', 'Concluído'],
  ] as const)('mantém o estado %s traduzido e acessível', (status, label) => {
    renderCard({ status });

    expect(screen.getByText(label)).toBeVisible();
    const statusBadge = screen.getByText(label).closest('[data-slot="badge"]');
    expect(statusBadge).toHaveClass('border-border');
    expect(statusBadge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dá precedência visual a Novo sem esconder o estado da tentativa', () => {
    renderCard({ isNew: true, status: 'COMPLETED' });

    const newBadge = screen.getByText('Novo').closest('[data-slot="badge"]');
    const statusBadge = screen.getByText('Concluído').closest('[data-slot="badge"]');
    expect(newBadge).toHaveClass('bg-primary');
    expect(statusBadge).toHaveClass('border-border');
    expect(screen.getByText('Concluído')).toBeVisible();
  });

  it('usa o snapshot da tentativa na barra e expõe os três contadores no nome', () => {
    renderCard({
      itemCount: 9,
      status: 'IN_PROGRESS',
      progress: { answeredCount: 2, correctCount: 1, itemCount: 5 },
    });

    const progress = screen.getByRole('progressbar', {
      name: '2 questões respondidas de 5; 1 correta',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '40');
    expect(within(progress).getByText('2/5')).toBeVisible();
    expect(within(progress).getByText('40%')).toBeVisible();
    expect(screen.getByText('9 questões')).toBeVisible();
  });

  it('trata snapshot zero sem NaN ou Infinity', () => {
    renderCard({
      status: 'IN_PROGRESS',
      progress: { answeredCount: 0, correctCount: 0, itemCount: 0 },
    });

    const progress = screen.getByRole('progressbar', {
      name: '0 questões respondidas de 0; 0 corretas',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveTextContent('0/0');
    expect(progress).toHaveTextContent('0%');
    expect(progress).not.toHaveTextContent(/NaN|Infinity/);
  });

  it('usa pluralização do catálogo para a contagem atual', () => {
    const { rerender } = renderCard({ itemCount: 1 });
    expect(screen.getByText('1 questão')).toBeVisible();

    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <ExerciseCard {...baseProps} itemCount={2} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('2 questões')).toBeVisible();
  });

  it('usa Exercise.id no link/testid e oferece card integral com foco e alvo mínimo', () => {
    renderCard({ supportLanguage: 'EN_US' });

    const card = screen.getByTestId(`exercise-assignment-card-${EXERCISE_ID}`);
    expect(card).toHaveAttribute('href', `/exercises/${EXERCISE_ID}`);
    expect(card).toHaveClass(
      'h-full',
      'min-h-11',
      'rounded-2xl',
      'border-border',
      'bg-card',
      'p-5',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
    );
    expect(card).toHaveTextContent('Inglês');
    expect(card).toHaveTextContent('Nível 2');
    expect(card).toHaveTextContent('Gramática');
  });

  it('não reintroduz copy, testids nem cores diretas no componente', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/exercises/exercise-card.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/exercises-list|exercise-card-/);
    expect(source).not.toMatch(/(?:text|bg|border)-(?:green|amber|red|yellow|blue)-/);
    expect(source).not.toMatch(/\bNivel\b|\bNovo\b|quest(?:ao|oes)/);
    expect(source).not.toContain('LANGUAGE_LABELS');
  });
});
