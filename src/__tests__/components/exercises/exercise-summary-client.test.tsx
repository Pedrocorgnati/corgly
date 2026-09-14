import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseSummaryClient,
  type AttemptSummary,
} from '@/components/exercises/exercise-summary-client';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const matchPayload = {
  left: [
    { id: 'l1', text: 'one' },
    { id: 'l2', text: 'two' },
    { id: 'l3', text: 'three' },
  ],
  right: [
    { id: 'r1', text: 'um' },
    { id: 'r2', text: 'dois' },
    { id: 'r3', text: 'três' },
  ],
};
const matchPairs = [
  { leftId: 'l1', rightId: 'r1' },
  { leftId: 'l2', rightId: 'r2' },
  { leftId: 'l3', rightId: 'r3' },
];

function completedSummary(): AttemptSummary {
  return {
    attemptId: 'at-1',
    exerciseId: 'ex-1',
    exerciseTitle: 'Título localizado',
    status: 'COMPLETED',
    answeredCount: 4,
    correctCount: 2,
    itemCount: 4,
    score: 0.5,
    scorePercent: 50,
    finishedAt: '2026-09-09T12:00:00.000Z',
    items: [
      {
        id: 'mc',
        kind: 'MULTIPLE_CHOICE',
        position: 1,
        payload: { prompt: 'Escolha', options: ['A um', 'B dois', 'C três', 'D quatro'] },
        answerKey: { correctIndex: 1 },
        userAnswer: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 },
        isCorrect: false,
      },
      {
        id: 'text',
        kind: 'TEXT_CHOICE',
        position: 2,
        payload: { readingText: 'Leia este texto.', prompt: 'Responda', options: ['Não', 'Sim'] },
        answerKey: { correctIndex: 1 },
        userAnswer: { kind: 'TEXT_CHOICE', selectedIndex: 1 },
        isCorrect: true,
      },
      {
        id: 'match',
        kind: 'MATCH_CLICK',
        position: 3,
        payload: matchPayload,
        answerKey: { pairs: matchPairs },
        userAnswer: { kind: 'MATCH_CLICK', pairs: matchPairs },
        isCorrect: true,
      },
      {
        id: 'verb',
        kind: 'VERB_CLOZE',
        position: 4,
        payload: {
          infinitive: 'falar',
          tense: 'PRESENTE_INDICATIVO',
          person: 'EU',
          sentence: 'Eu {{verbo}} português.',
        },
        answerKey: { canonical: 'falo', accepted: [] },
        userAnswer: { kind: 'VERB_CLOZE', text: 'fala' },
        isCorrect: false,
      },
    ],
  };
}

function renderSummary(summary = completedSummary()) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <ExerciseSummaryClient summary={summary} />
    </NextIntlClientProvider>,
  );
}

describe('ExerciseSummaryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('interpreta os quatro contratos canônicos, posição 1-based e kinds traduzidos', async () => {
    const user = userEvent.setup();
    renderSummary();

    expect(screen.getByRole('heading', { name: 'Título localizado' })).toBeInTheDocument();
    expect(screen.getByTestId('item-trigger-1')).toHaveTextContent('Item 1');
    expect(screen.getByTestId('item-trigger-1')).toHaveTextContent('Múltipla escolha');
    expect(screen.getByTestId('item-trigger-2')).toHaveTextContent('Leitura e escolha');
    expect(screen.getByTestId('item-trigger-3')).toHaveTextContent('Ligar pares');
    expect(screen.getByTestId('item-trigger-4')).toHaveTextContent('Conjugação na frase');
    expect(screen.getByTestId('item-state-1')).toHaveTextContent('Incorreto');
    expect(screen.getByTestId('item-state-2')).toHaveTextContent('Correto');

    await user.click(screen.getByTestId('item-trigger-1'));
    expect(screen.getByText('B dois').closest('li')).toHaveClass('text-success');
    expect(screen.getByText('A um').closest('li')).toHaveClass('text-destructive');

    await user.click(screen.getByTestId('item-trigger-2'));
    expect(screen.getByText('Leia este texto.')).toBeInTheDocument();

    await user.click(screen.getByTestId('item-trigger-3'));
    const correctPairs = screen.getByText('Pares corretos').parentElement;
    expect(correctPairs).not.toBeNull();
    expect(within(correctPairs!).getByText('one')).toBeInTheDocument();
    expect(within(correctPairs!).getByText('um')).toBeInTheDocument();

    await user.click(screen.getByTestId('item-trigger-4'));
    expect(screen.getByText('falo')).toBeInTheDocument();
    expect(screen.getByText('fala')).toBeInTheDocument();
  });

  it('resolve no TEXT_CHOICE o correctIndex e a resposta do aluno por índices distintos', async () => {
    const user = userEvent.setup();
    const summary = completedSummary();
    summary.items = [
      {
        id: 'text-distinct-indices',
        kind: 'TEXT_CHOICE',
        position: 1,
        payload: {
          readingText: 'O texto permite comparar resposta e gabarito.',
          prompt: 'Qual opção está correta?',
          options: ['Escolha no índice zero', 'Outra opção', 'Gabarito no índice dois'],
        },
        answerKey: { correctIndex: 2 },
        userAnswer: { kind: 'TEXT_CHOICE', selectedIndex: 0 },
        isCorrect: false,
      },
    ];
    renderSummary(summary);

    await user.click(screen.getByTestId('item-trigger-1'));

    expect(screen.getByText('O texto permite comparar resposta e gabarito.')).toBeInTheDocument();
    expect(screen.getByText('Qual opção está correta?')).toBeInTheDocument();
    expect(screen.getByText('Gabarito no índice dois').closest('li')).toHaveClass(
      'bg-success/10',
      'text-success',
    );
    expect(screen.getByText('Escolha no índice zero').closest('li')).toHaveClass(
      'bg-destructive/10',
      'text-destructive',
      'line-through',
    );
  });

  it('mostra os pares enviados pelo aluno separados do gabarito do MATCH_CLICK', async () => {
    const user = userEvent.setup();
    const summary = completedSummary();
    summary.items = [
      {
        id: 'match-with-wrong-pair',
        kind: 'MATCH_CLICK',
        position: 1,
        payload: matchPayload,
        answerKey: { pairs: matchPairs },
        userAnswer: {
          kind: 'MATCH_CLICK',
          pairs: [
            { leftId: 'l1', rightId: 'r2' },
            { leftId: 'l2', rightId: 'r1' },
            { leftId: 'l3', rightId: 'r3' },
          ],
        },
        isCorrect: false,
      },
    ];
    renderSummary(summary);

    await user.click(screen.getByTestId('item-trigger-1'));

    const studentPairs = screen.getByText('Seus pares').parentElement;
    const correctPairs = screen.getByText('Pares corretos').parentElement;
    expect(studentPairs).not.toBeNull();
    expect(correctPairs).not.toBeNull();

    const studentPairForOne = within(studentPairs!).getByText('one').closest('li');
    const correctPairForOne = within(correctPairs!).getByText('one').closest('li');
    expect(studentPairForOne).toHaveTextContent('dois');
    expect(studentPairForOne).not.toHaveTextContent('um');
    expect(correctPairForOne).toHaveTextContent('um');
    expect(correctPairForOne).not.toHaveTextContent('dois');
  });

  it('renderiza ABANDONED sem percentual nem CTA de nova tentativa', () => {
    const summary = completedSummary();
    summary.status = 'ABANDONED';
    renderSummary(summary);

    expect(screen.getByText('Abandonado')).toBeInTheDocument();
    expect(screen.queryByText('50% de acerto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refazer o exercício/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voltar para exercícios/i })).toBeInTheDocument();
  });

  it('mantém os CTAs do resumo concluído com alvo mínimo de 44 por 44 px', () => {
    renderSummary();

    expect(screen.getByRole('button', { name: /Voltar para exercícios/i })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
    expect(screen.getByRole('button', { name: /Refazer o exercício/i })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
  });

  it('mostra estado não respondido sem exigir ou renderizar gabarito', async () => {
    const user = userEvent.setup();
    const summary = completedSummary();
    summary.status = 'IN_PROGRESS';
    summary.items = [
      {
        ...summary.items[0],
        answerKey: null,
        userAnswer: null,
        isCorrect: null,
      },
    ];
    renderSummary(summary);

    expect(screen.getByTestId('item-state-1')).toHaveTextContent('Não respondido');
    await user.click(screen.getByTestId('item-trigger-1'));
    expect(screen.queryByText('Resposta correta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refazer o exercício/i })).not.toBeInTheDocument();
  });

  it('inicia nova tentativa pelo endpoint canônico e navega para o exercício', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { attempt: { id: 'at-2' } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderSummary();

    await user.click(screen.getByRole('button', { name: /Refazer o exercício/i }));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts', {
      method: 'POST',
      credentials: 'include',
    });
    expect(push).toHaveBeenCalledWith('/exercises/ex-1');
  });

  it('mantém o Refazer visível e anuncia falha recuperável', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));
    renderSummary();

    const retry = screen.getByRole('button', { name: /Refazer o exercício/i });
    await user.click(retry);

    expect(retry).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível iniciar uma nova tentativa');
    expect(push).not.toHaveBeenCalledWith('/exercises/ex-1');
  });
});
