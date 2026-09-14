import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../i18n/messages/pt-BR.json';
import { ExercisePreview } from './exercise-preview';
import {
  ExerciseEditor,
  type ExerciseEditorInitial,
  type ExerciseItemForm,
} from '../exercise-editor';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const baseItem: ExerciseItemForm = {
  id: 'item-1',
  kind: 'MULTIPLE_CHOICE',
  acceptWithoutAccent: false,
  prompt: 'Escolha a resposta',
  options: ['Primeira alternativa', 'Segunda alternativa', 'Terceira alternativa', 'Quarta alternativa'],
  correctIndex: 0,
  readingText: '',
  infinitive: '',
  tense: 'PRESENTE_INDICATIVO',
  person: 'EU',
  sentence: '',
  canonical: '',
  acceptedText: '',
  left: [],
  right: [],
  pairs: [],
};

function choiceItem(
  kind: 'MULTIPLE_CHOICE' | 'TEXT_CHOICE',
  options: string[],
  correctIndex: number,
  overrides: Partial<ExerciseItemForm> = {},
): ExerciseItemForm {
  return {
    ...baseItem,
    ...overrides,
    kind,
    options,
    correctIndex,
    readingText:
      overrides.readingText ??
      (kind === 'TEXT_CHOICE' ? 'Leia o texto antes de responder.' : ''),
  };
}

function editorInitial(): ExerciseEditorInitial {
  return {
    id: 'exercise-editor-preview',
    internalTitle: 'Exercício de integração',
    supportLanguage: 'PT_BR',
    level: 1,
    subject: 'Gramática',
    tags: [],
    timeEstimateMin: null,
    status: 'DRAFT',
    translations: {
      PT_BR: { locale: 'PT_BR', title: 'Título', summary: '' },
      EN_US: { locale: 'EN_US', title: '', summary: '' },
      ES_ES: { locale: 'ES_ES', title: '', summary: '' },
      IT_IT: { locale: 'IT_IT', title: '', summary: '' },
    },
    items: [
      choiceItem('MULTIPLE_CHOICE', ['Certa', 'Errada', 'Outra', 'Última'], 0, {
        prompt: 'Pergunta integrada',
      }),
    ],
  };
}

function matchItem(overrides: Partial<ExerciseItemForm> = {}): ExerciseItemForm {
  return {
    ...baseItem,
    ...overrides,
    kind: 'MATCH_CLICK',
    prompt: '',
    options: [],
    correctIndex: -1,
    left: [
      { id: 'left-1', text: 'Good morning' },
      { id: 'left-2', text: 'Good night' },
    ],
    right: [
      { id: 'right-1', text: 'Bom dia' },
      { id: 'right-2', text: 'Boa noite' },
    ],
    pairs: [
      { leftId: 'left-1', rightId: 'right-1' },
      { leftId: 'left-2', rightId: 'right-2' },
    ],
  };
}

function verbItem(overrides: Partial<ExerciseItemForm> = {}): ExerciseItemForm {
  return {
    ...baseItem,
    ...overrides,
    kind: 'VERB_CLOZE',
    prompt: '',
    options: [],
    correctIndex: -1,
    infinitive: 'falar',
    tense: 'PRESENTE_INDICATIVO',
    person: 'EU',
    sentence: 'Eu {{verbo}} português todos os dias.',
    canonical: 'falo',
    acceptedText: 'converso\n  digo  ',
  };
}

function renderPreview(items: ExerciseItemForm[], onClose = vi.fn()) {
  const user = userEvent.setup();
  const view = render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ExercisePreview items={items} onClose={onClose} />
    </NextIntlClientProvider>,
  );

  return { ...view, user, onClose };
}

function resultBar() {
  const wrapper = screen.getByTestId('admin-exercise-preview-result-bar');
  expect(within(wrapper).getAllByTestId('exercise-result')).toHaveLength(1);
  return within(wrapper).getByTestId('exercise-result');
}

describe('ExercisePreview', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    { correctIndex: 0, letter: 'a', answer: 'Sim' },
    { correctIndex: 1, letter: 'b', answer: 'Não' },
  ])(
    'renderiza e permite conferir cada uma das duas alternativas de TEXT_CHOICE: $letter',
    async ({ correctIndex, letter, answer }) => {
      const { user } = renderPreview([
        choiceItem('TEXT_CHOICE', ['Sim', 'Não'], correctIndex, {
          readingText: 'Linha um.\nLinha dois.',
        }),
      ]);

      expect(screen.getByTestId('reading-text')).toHaveTextContent('Linha um. Linha dois.');
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      expect(screen.getByText('Sim')).toBeInTheDocument();
      expect(screen.getByText('Não')).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: new RegExp(`Alternativa ${letter}`, 'i') }));
      await user.click(screen.getByRole('button', { name: 'Conferir' }));

      expect(resultBar()).toHaveTextContent('Você acertou');
      expect(resultBar()).toHaveTextContent(`Resposta certa: ${letter}) ${answer}`);
    },
  );

  it('renderiza e confere a quinta alternativa de TEXT_CHOICE sem truncamento', async () => {
    const options = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'];
    const { user } = renderPreview([choiceItem('TEXT_CHOICE', options, 4)]);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    options.forEach((option) => expect(screen.getByText(option)).toBeInTheDocument());

    const fifth = screen.getByRole('radio', { name: /Alternativa e/i });
    await user.click(fifth);
    expect(fifth).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você acertou');
    expect(resultBar()).toHaveTextContent('Resposta certa: e) Cinco');
  });

  it('mostra a quinta alternativa de TEXT_CHOICE como gabarito depois de um erro', async () => {
    const { user } = renderPreview([
      choiceItem('TEXT_CHOICE', ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'], 4),
    ]);

    await user.click(screen.getByRole('radio', { name: /Alternativa a/i }));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você errou');
    expect(resultBar()).toHaveTextContent('Sua resposta: a) Um');
    expect(resultBar()).toHaveTextContent('Resposta certa: e) Cinco');
  });

  it('mantém MULTIPLE_CHOICE limitado à cardinalidade fixa vigente', () => {
    renderPreview([
      choiceItem('MULTIPLE_CHOICE', ['A', 'B', 'C', 'D', 'opção excedente'], 0),
    ]);

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByText('opção excedente')).not.toBeInTheDocument();
  });

  it.each([
    { selectedLetter: 'a', expected: 'Você acertou' },
    { selectedLetter: 'b', expected: 'Você errou' },
  ])('usa a barra compartilhada no acerto e erro de MULTIPLE_CHOICE', async ({ selectedLetter, expected }) => {
    const { user } = renderPreview([
      choiceItem('MULTIPLE_CHOICE', ['Certa', 'Errada', 'Outra', 'Última'], 0),
    ]);

    await user.click(
      screen.getByRole('radio', { name: new RegExp(`Alternativa ${selectedLetter}`, 'i') }),
    );
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent(expected);
  });

  it('aceita os pares corretos de MATCH_CLICK independentemente da ordem de interação', async () => {
    const { user } = renderPreview([matchItem()]);

    await user.click(screen.getByTestId('match-entry-left-left-2'));
    await user.click(screen.getByTestId('match-entry-right-right-2'));
    await user.click(screen.getByTestId('match-entry-left-left-1'));
    await user.click(screen.getByTestId('match-entry-right-right-1'));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você acertou');
    expect(screen.queryByTestId('match-correct-pairs')).not.toBeInTheDocument();
  });

  it('usa a barra compartilhada e o renderer de pares como gabarito no erro de MATCH_CLICK', async () => {
    const { user } = renderPreview([matchItem()]);

    await user.click(screen.getByTestId('match-entry-left-left-1'));
    await user.click(screen.getByTestId('match-entry-right-right-2'));
    await user.click(screen.getByTestId('match-entry-left-left-2'));
    await user.click(screen.getByTestId('match-entry-right-right-1'));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você errou');
    expect(screen.getByTestId('match-correct-pairs')).toBeInTheDocument();
    const correctPairs = within(screen.getByTestId('match-correct-pairs'));
    expect(correctPairs.getByText('Bom dia')).toBeInTheDocument();
    expect(correctPairs.getByText('Boa noite')).toBeInTheDocument();
  });

  it('permanece em answering enquanto MATCH_CLICK estiver incompleto e limpa o aviso ao completar', async () => {
    const { user } = renderPreview([matchItem()]);

    await user.click(screen.getByTestId('match-entry-left-left-1'));
    await user.click(screen.getByTestId('match-entry-right-right-1'));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma resposta');
    expect(screen.queryByTestId('exercise-result')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('match-entry-left-left-2'));
    await user.click(screen.getByTestId('match-entry-right-right-2'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você acertou');
  });

  it.each([
    { answer: 'falo', label: 'forma canônica' },
    { answer: 'converso', label: 'variante aceita' },
  ])('aceita VERB_CLOZE por $label e mantém a forma canônica visível', async ({ answer }) => {
    const { user } = renderPreview([verbItem()]);

    await user.type(screen.getByTestId('cloze-input'), answer);
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você acertou');
    expect(screen.getByTestId('admin-exercise-preview-verb-correct-answer')).toHaveTextContent(
      'Resposta correta: falo',
    );
    expect(screen.queryByTestId('cloze-correct-form')).not.toBeInTheDocument();
  });

  it('usa a barra compartilhada e mostra a forma canônica no erro de VERB_CLOZE', async () => {
    const { user } = renderPreview([verbItem()]);

    await user.type(screen.getByTestId('cloze-input'), 'falou');
    await user.keyboard('{Enter}');

    expect(resultBar()).toHaveTextContent('Você errou');
    expect(screen.getByTestId('cloze-correct-form')).toHaveTextContent('falo');
    expect(screen.getByTestId('admin-exercise-preview-verb-correct-answer')).toHaveTextContent(
      'Resposta correta: falo',
    );
  });

  it('permanece em answering com VERB_CLOZE vazio e limpa o aviso ao digitar', async () => {
    const { user } = renderPreview([verbItem()]);

    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma resposta');
    expect(screen.queryByTestId('exercise-result')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('cloze-input'), 'falo');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    expect(resultBar()).toHaveTextContent('Você acertou');
  });

  it('avisa seleção ausente e limpa o aviso ao interagir e ao avançar de item', async () => {
    const first = choiceItem('MULTIPLE_CHOICE', ['A1', 'B1', 'C1', 'D1'], 0, {
      id: 'first',
      prompt: 'Primeira pergunta',
    });
    const second = choiceItem('MULTIPLE_CHOICE', ['A2', 'B2', 'C2', 'D2'], 1, {
      id: 'second',
      prompt: 'Segunda pergunta',
    });
    const { user } = renderPreview([first, second]);

    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma resposta');

    await user.click(screen.getByRole('radio', { name: /Alternativa a/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Segunda pergunta')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
  });

  it('nomeia o progresso com a posição atual para tecnologia assistiva', () => {
    renderPreview([
      choiceItem('MULTIPLE_CHOICE', ['A1', 'B1', 'C1', 'D1'], 0),
      choiceItem('TEXT_CHOICE', ['A2', 'B2'], 1),
    ]);

    expect(screen.getByRole('progressbar', { name: 'Progresso do preview' })).toHaveAttribute(
      'aria-valuetext',
      'Questão 1 de 2',
    );
  });

  it('mantém a integração da aba Revisão ao abrir e fechar o preview com os itens do editor', async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <ExerciseEditor
          initialTab="review"
          initial={editorInitial()}
        />
      </NextIntlClientProvider>,
    );

    const openPreview = screen.getByTestId('admin-exercise-editor-start-preview-button');
    expect(openPreview).toBeEnabled();
    await user.click(openPreview);

    expect(screen.getByTestId('admin-exercise-preview')).toBeInTheDocument();
    expect(screen.getByText('Pergunta integrada')).toBeInTheDocument();

    await user.click(screen.getByTestId('admin-exercise-preview-close-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-exercise-preview')).not.toBeInTheDocument();
    });
  });

  it('abre o diálogo real quando o deep link inicial solicita o preview', async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <ExerciseEditor
          initial={editorInitial()}
          initialTab="review"
          initialPreviewOpen
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('admin-exercise-preview')).toBeInTheDocument();
    expect(screen.getByText('Pergunta integrada')).toBeInTheDocument();

    await user.click(screen.getByTestId('admin-exercise-preview-close-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-exercise-preview')).not.toBeInTheDocument();
    });
  });

  it('avança, conclui, refaz e sai mantendo todo o estado local', async () => {
    const onClose = vi.fn();
    const { user } = renderPreview(
      [
        choiceItem('MULTIPLE_CHOICE', ['A1', 'B1', 'C1', 'D1'], 0, {
          id: 'first',
          prompt: 'Primeira pergunta',
        }),
        choiceItem('TEXT_CHOICE', ['A2', 'B2'], 1, {
          id: 'second',
          prompt: 'Segunda pergunta',
        }),
      ],
      onClose,
    );

    await user.click(screen.getByRole('radio', { name: /Alternativa a/i }));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('radio', { name: /Alternativa a/i }));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    expect(screen.getByTestId('admin-exercise-preview-result-bar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(screen.getByText('Simulação concluída')).toBeInTheDocument();
    expect(screen.getByTestId('admin-exercise-preview-score')).toHaveTextContent('1 de 2 acertos');

    await user.click(screen.getByTestId('admin-exercise-preview-retry-button'));
    expect(screen.getByText('Primeira pergunta')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-exercise-preview-result-bar')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('admin-exercise-preview-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('não chama fetch ao conferir, finalizar, refazer e fechar o preview', async () => {
    const onClose = vi.fn();
    const { user } = renderPreview(
      [choiceItem('MULTIPLE_CHOICE', ['A', 'B', 'C', 'D'], 0)],
      onClose,
    );

    await user.click(screen.getByRole('radio', { name: /Alternativa a/i }));
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    await user.click(screen.getByRole('button', { name: 'Finalizar' }));
    await user.click(screen.getByRole('button', { name: 'Refazer' }));
    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
