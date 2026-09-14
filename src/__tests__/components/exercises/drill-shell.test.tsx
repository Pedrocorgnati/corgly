import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DrillShell,
  type DrillExercise,
} from '@/components/exercises/drill-shell';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const exercise: DrillExercise = {
  id: 'ex-1',
  title: 'Exercício localizado',
  items: [
    {
      id: 'item-1',
      kind: 'MATCH_CLICK',
      position: 1,
      payload: {
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
      },
    },
  ],
};

const correctPairs = [
  { leftId: 'l1', rightId: 'r1' },
  { leftId: 'l2', rightId: 'r2' },
  { leftId: 'l3', rightId: 'r3' },
];

const choiceExercise: DrillExercise = {
  id: 'ex-1',
  title: 'Exercício localizado',
  items: [
    {
      id: 'choice-1',
      kind: 'MULTIPLE_CHOICE',
      position: 1,
      payload: {
        prompt: 'Escolha',
        options: ['Um', 'Dois', 'Três', 'Quatro'],
      },
    },
  ],
};

function response(data: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => ({ data }),
  } as Response;
}

function attempt(id: string) {
  return {
    attempt: {
      id,
      answeredCount: 0,
      correctCount: 0,
      itemCount: 1,
      answeredItemIds: [],
    },
  };
}

function renderDrill(drillExercise = exercise) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <DrillShell exercise={drillExercise} />
    </NextIntlClientProvider>,
  );
}

describe('DrillShell com MATCH_CLICK imediato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('valida cada candidato sem persistir e salva a resposta completa uma vez no Conferir', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/exercises/ex-1/attempts') {
        return response({
          attempt: {
            id: 'at-1',
            answeredCount: 0,
            correctCount: 0,
            itemCount: 1,
            answeredItemIds: [],
          },
        });
      }
      if (url.endsWith('/match-check')) return response({ isCorrect: true });
      if (url.endsWith('/answers')) {
        return response({
          isCorrect: true,
          answerKey: { pairs: correctPairs },
          answeredCount: 1,
          correctCount: 1,
          itemCount: 1,
        });
      }
      throw new Error(`Requisição inesperada: ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderDrill();

    await screen.findByRole('button', { name: 'one' });
    expect(screen.getByTestId('drill-close-button')).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByTestId('exercise-check-button')).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByTestId('exercise-retry-button')).toHaveClass('min-h-11', 'min-w-11');

    for (const [leftId, rightId] of [
      ['l1', 'r1'],
      ['l2', 'r2'],
      ['l3', 'r3'],
    ]) {
      await user.click(screen.getByTestId(`match-entry-left-${leftId}`));
      await user.click(screen.getByTestId(`match-entry-right-${rightId}`));
      await waitFor(() => {
        expect(screen.getByTestId(`match-entry-left-${leftId}`)).toHaveAttribute(
          'aria-disabled',
          'true',
        );
      });
    }

    const callsBeforeCheck = fetchMock.mock.calls.map(([input]) => String(input));
    expect(callsBeforeCheck.filter((url) => url.endsWith('/match-check'))).toHaveLength(3);
    expect(callsBeforeCheck.filter((url) => url.endsWith('/answers'))).toHaveLength(0);

    const matchCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/match-check'),
    );
    expect(matchCalls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual(correctPairs);

    await user.click(screen.getByTestId('exercise-check-button'));
    await screen.findByTestId('exercise-next-button');
    expect(screen.getByTestId('exercise-next-button')).toHaveClass('min-h-11', 'min-w-11');

    const answerCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/answers'));
    expect(answerCalls).toHaveLength(1);
    expect(JSON.parse(String(answerCalls[0]?.[1]?.body))).toEqual({
      itemId: 'item-1',
      answer: { kind: 'MATCH_CLICK', pairs: correctPairs },
    });
  });

  it('bloqueia reentrada sincrona e persiste somente um POST sob duplo clique', async () => {
    let resolveAnswer!: (value: Response) => void;
    const pendingAnswer = new Promise<Response>((resolve) => {
      resolveAnswer = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/v1/exercises/ex-1/attempts') {
        return Promise.resolve(response(attempt('at-1')));
      }
      if (url.endsWith('/answers')) return pendingAnswer;
      throw new Error(`Requisição inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDrill(choiceExercise);

    await userEvent.click(await screen.findByRole('radio', { name: /Alternativa A/i }));
    const checkButton = screen.getByTestId('exercise-check-button');
    fireEvent.click(checkButton);
    fireEvent.click(checkButton);

    expect(checkButton).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/answers'))).toHaveLength(1);

    await act(async () => {
      resolveAnswer(response({
        isCorrect: true,
        answerKey: { correctIndex: 0 },
        answeredCount: 1,
        correctCount: 1,
        itemCount: 1,
      }));
    });
    await screen.findByTestId('exercise-next-button');
  });

  it('integra incorreto e 429, preserva o candidato e permite retry sem persistir', async () => {
    let correctCandidateCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/exercises/ex-1/attempts') return response(attempt('at-1'));
      if (url.endsWith('/match-check')) {
        const pair = JSON.parse(String(init?.body)) as { leftId: string; rightId: string };
        if (pair.rightId === 'r2') return response({ isCorrect: false });
        correctCandidateCalls += 1;
        return correctCandidateCalls === 1
          ? response(null, false, 429)
          : response({ isCorrect: true });
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderDrill();

    await user.click(await screen.findByTestId('match-entry-left-l1'));
    await user.click(screen.getByTestId('match-entry-right-r2'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('não formam um par'));
    expect(screen.getByText('0 de 3 pares')).toBeInTheDocument();

    await user.click(screen.getByTestId('match-entry-left-l1'));
    await user.click(screen.getByTestId('match-entry-right-r1'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('seleção foi mantida'));
    expect(screen.getByTestId('match-entry-left-l1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('match-entry-right-r1')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('1 de 3 pares')).toBeInTheDocument());

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter((url) => url.endsWith('/match-check'))).toHaveLength(3);
    expect(urls.filter((url) => url.endsWith('/answers'))).toHaveLength(0);
  });

  it('Refazer abandona uma tentativa ativa uma vez e recupera falha ao abrir a nova', async () => {
    let startCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/exercises/ex-1/attempts') {
        startCalls += 1;
        if (startCalls === 1) return response(attempt('at-1'));
        if (startCalls === 2) return response(null, false);
        return response(attempt('at-2'));
      }
      if (url === '/api/v1/exercises/attempts/at-1' && init?.method === 'PATCH') {
        return response({ status: 'ABANDONED' });
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderDrill(choiceExercise);

    await screen.findByRole('radio', { name: /Alternativa A/i });
    await user.click(screen.getByTestId('exercise-retry-button'));
    await waitFor(() => expect(screen.getByTestId('exercise-retry-error')).toBeInTheDocument());

    await user.click(screen.getByTestId('exercise-retry-button'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/exercises/ex-1'));

    const abandonCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input).endsWith('/attempts/at-1') && init?.method === 'PATCH',
    );
    expect(abandonCalls).toHaveLength(1);
    expect(JSON.parse(String(abandonCalls[0]?.[1]?.body))).toEqual({ action: 'abandon' });
    expect(startCalls).toBe(3);
    expect(screen.getByTestId('exercise-announcement')).toHaveTextContent('Exercício reiniciado');
  });

  it('finaliza, preserva a concluída e abre nova tentativa sem PATCH', async () => {
    let startCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/v1/exercises/ex-1/attempts') {
        startCalls += 1;
        return response(attempt(startCalls === 1 ? 'at-1' : 'at-2'));
      }
      if (url.endsWith('/answers')) {
        return response({
          isCorrect: true,
          answerKey: { correctIndex: 0 },
          answeredCount: 1,
          correctCount: 1,
          itemCount: 1,
        });
      }
      if (url.endsWith('/finish')) return response({ status: 'COMPLETED' });
      throw new Error(`Requisição inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderDrill(choiceExercise);

    await user.click(await screen.findByRole('radio', { name: /Alternativa A/i }));
    await user.click(screen.getByTestId('exercise-check-button'));
    await user.click(await screen.findByTestId('exercise-next-button'));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/exercises/ex-1/attempt/at-1/summary');
    });

    await user.click(screen.getByTestId('exercise-retry-button'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/exercises/ex-1'));

    expect(startCalls).toBe(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/v1/exercises/attempts/at-1')).toBe(false);
  });

  it('aplica 44 px ao retry inicial e ao CTA do estado vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(null, false)));
    const firstRender = renderDrill(choiceExercise);
    expect(await screen.findByTestId('drill-start-retry-button')).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
    firstRender.unmount();

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    renderDrill({ ...choiceExercise, items: [] });
    expect(screen.getByTestId('drill-close-button')).toHaveClass('min-h-11', 'min-w-11');
  });
});
