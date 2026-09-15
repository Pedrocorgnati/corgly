import { render, screen, fireEvent, waitFor, within } from '@/test/utils';
import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from 'next-intl';
import { BulkBlockModal } from '@/components/admin/BulkBlockModal';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiError: class ApiError extends Error {},
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

/** Preenche os tres campos exigidos por `canSubmit`. */
function preencherFormulario() {
  fireEvent.change(screen.getByTestId('modal-bulk-block-start-input'), {
    target: { value: '2026-04-01' },
  });
  fireEvent.change(screen.getByTestId('modal-bulk-block-end-input'), {
    target: { value: '2026-04-30' },
  });
  fireEvent.change(screen.getByTestId('modal-bulk-block-reason-input'), {
    target: { value: 'Ferias do professor' },
  });
}

describe('BulkBlockModal — previa real (item 008)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockToastWarning.mockReset();
  });

  // C9.1 — a previa vem da API, nao de zeros semeados no cliente
  it('deve exibir os contadores devolvidos pela API e liberar a confirmacao', async () => {
    mockGet.mockResolvedValueOnce({ data: { sessionsToCancel: 7, slotsToBlock: 12 } });

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    const previa = await screen.findByTestId('modal-bulk-block-preview');
    expect(previa).toHaveTextContent('7 sessões serão canceladas');
    expect(previa).toHaveTextContent('12 slots serão bloqueados');
    expect(screen.getByTestId('modal-bulk-block-confirm-button')).toBeInTheDocument();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/sessions/bulk-cancel', {
      params: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
  });

  // C9.2 — falha de previa e visivel e NAO libera o botao destrutivo
  it('deve mostrar o erro e nao liberar a confirmacao quando a previa falha', async () => {
    mockGet.mockRejectedValueOnce(new Error('Erro interno.'));

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    const erro = await screen.findByTestId('modal-bulk-block-preview-error');
    expect(erro).toHaveTextContent('Erro interno.');
    expect(screen.queryByTestId('modal-bulk-block-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modal-bulk-block-confirm-button')).not.toBeInTheDocument();
  });

  // Regressao do finding `error` do review do item 008: resposta obsoleta nao
  // pode repovoar a previa depois que o operador trocou o periodo.
  it('deve descartar a previa em voo quando o periodo muda antes da resposta', async () => {
    let resolverPreviaAntiga: (v: unknown) => void = () => {};
    mockGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolverPreviaAntiga = resolve;
      }),
    );

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    // Operador troca o periodo com a previa ainda em voo.
    fireEvent.change(screen.getByTestId('modal-bulk-block-end-input'), {
      target: { value: '2026-05-31' },
    });

    // A resposta do periodo ANTIGO chega depois.
    resolverPreviaAntiga({ data: { sessionsToCancel: 7, slotsToBlock: 12 } });

    await waitFor(() => {
      expect(screen.getByTestId('modal-bulk-block-preview-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('modal-bulk-block-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modal-bulk-block-confirm-button')).not.toBeInTheDocument();
    // Spinner nao pode ficar preso: o botao de previa volta habilitado.
    expect(screen.getByTestId('modal-bulk-block-preview-button')).not.toBeDisabled();
  });

  // Mesma classe, caminho de erro: rejeicao obsoleta nao pinta erro do periodo novo.
  it('deve descartar o erro de uma previa obsoleta apos troca de periodo', async () => {
    let rejeitarPreviaAntiga: (e: unknown) => void = () => {};
    mockGet.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejeitarPreviaAntiga = reject;
      }),
    );

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    fireEvent.change(screen.getByTestId('modal-bulk-block-start-input'), {
      target: { value: '2026-04-15' },
    });

    rejeitarPreviaAntiga(new Error('Erro do periodo antigo.'));

    await waitFor(() => {
      expect(screen.getByTestId('modal-bulk-block-preview-button')).not.toBeDisabled();
    });
    expect(screen.queryByTestId('modal-bulk-block-preview-error')).not.toBeInTheDocument();
  });

  // GAP-008: duas respostas VALIDAS fora de ordem. A requisicao B (periodo novo)
  // responde antes da A (periodo antigo); a ordem vem so dos resolvers. A resposta
  // antiga nao pode substituir os contadores de B nem mexer na confirmacao.
  it('deve manter a previa da requisicao mais recente quando a antiga responde por ultimo', async () => {
    let resolverA: (v: unknown) => void = () => {};
    let resolverB: (v: unknown) => void = () => {};
    const promessaA = new Promise((resolve) => {
      resolverA = resolve;
    });
    const promessaB = new Promise((resolve) => {
      resolverB = resolve;
    });
    mockGet.mockReturnValueOnce(promessaA);
    mockGet.mockReturnValueOnce(promessaB);

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    // Requisicao A: periodo 2026-04-01 a 2026-04-30.
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    // Periodo B: `invalidatePreview` reabilita o botao de previa.
    fireEvent.change(screen.getByTestId('modal-bulk-block-end-input'), {
      target: { value: '2026-05-31' },
    });
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/v1/sessions/bulk-cancel', {
      params: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/v1/sessions/bulk-cancel', {
      params: { startDate: '2026-04-01', endDate: '2026-05-31' },
    });

    // B responde primeiro.
    resolverB({ data: { sessionsToCancel: 3, slotsToBlock: 5 } });
    const previa = await screen.findByTestId('modal-bulk-block-preview');
    expect(previa).toHaveTextContent('3 sessões serão canceladas');
    expect(previa).toHaveTextContent('5 slots serão bloqueados');
    expect(screen.getByTestId('modal-bulk-block-confirm-button')).toBeInTheDocument();

    // A responde por ultimo; `act` drena a continuacao de `handlePreview` antes das assercoes.
    await act(async () => {
      resolverA({ data: { sessionsToCancel: 7, slotsToBlock: 12 } });
      await promessaA;
    });

    const previaFinal = screen.getByTestId('modal-bulk-block-preview');
    expect(previaFinal).toHaveTextContent('3 sessões serão canceladas');
    expect(previaFinal).toHaveTextContent('5 slots serão bloqueados');
    expect(previaFinal).not.toHaveTextContent('7 sessões serão canceladas');
    expect(screen.queryByTestId('modal-bulk-block-preview-error')).not.toBeInTheDocument();
    const confirmar = screen.getByTestId('modal-bulk-block-confirm-button');
    expect(confirmar).toBeInTheDocument();
    expect(confirmar).not.toBeDisabled();
  });

  // C9.3 — o toast pos-execucao le as chaves reais do BulkCancelResult
  it('deve exibir os contadores reais no toast apos confirmar', async () => {
    mockGet.mockResolvedValueOnce({ data: { sessionsToCancel: 5, slotsToBlock: 9 } });
    mockPost.mockResolvedValueOnce({ data: { cancelled: 5, refunded: 3, blocked: 9, errors: [] } });
    const onComplete = vi.fn();

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={onComplete} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    fireEvent.click(await screen.findByTestId('modal-bulk-block-confirm-button'));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        '5 sessões canceladas, 3 créditos reembolsados, 9 horários bloqueados.',
      );
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // C9.4 — errors do POST ficam visiveis: modal aberto, lista com a copy do catalogo e toast de aviso
  it('[RED C9.4] deve manter o modal aberto e listar as sessoes nao canceladas com a copy do catalogo', async () => {
    mockGet.mockResolvedValueOnce({ data: { sessionsToCancel: 3, slotsToBlock: 9 } });
    mockPost.mockResolvedValueOnce({
      data: {
        cancelled: 2,
        refunded: 2,
        blocked: 9,
        errors: [{ sessionId: 'sess-falhou', code: 'SESSION_080', error: 'detalhe-interno-sintetico-gap09' }],
      },
    });
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();

    render(<BulkBlockModal open onOpenChange={onOpenChange} onComplete={onComplete} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));
    fireEvent.click(await screen.findByTestId('modal-bulk-block-confirm-button'));

    const lista = await screen.findByTestId('modal-bulk-block-submit-errors');
    const tModal = createTranslator({
      locale: 'pt-BR',
      messages: ptBR,
      namespace: 'bulkBlockModal',
    });
    const itemEsperado = tModal('resultado.item', { sessionId: 'sess-falhou', code: 'SESSION_080' });
    const toastEsperado = tModal('resultado.parcial', { cancelled: 2, refunded: 2, blocked: 9, falhas: 1 });
    expect(itemEsperado).not.toContain('bulkBlockModal.');
    expect(toastEsperado).not.toContain('bulkBlockModal.');
    expect(lista).toHaveAttribute('role', 'alert');
    expect(lista).toHaveTextContent(itemEsperado);
    expect(document.body.textContent ?? '').not.toContain('detalhe-interno-sintetico-gap09');
    expect(mockToastWarning).toHaveBeenCalledWith(toastEsperado);
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('modal-bulk-block-confirm-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('modal-bulk-block-preview-button')).toBeInTheDocument();
  });

  // C9.5: a previa usa a copy decidida no gate ST005, vinda do catalogo bulkBlockModal.previa
  it('[RED C9.5] deve exibir a previa na copy decidida no gate ST005', async () => {
    mockGet.mockResolvedValueOnce({ data: { sessionsToCancel: 3, slotsToBlock: 6 } });

    render(<BulkBlockModal open onOpenChange={vi.fn()} onComplete={vi.fn()} />);
    preencherFormulario();
    fireEvent.click(screen.getByTestId('modal-bulk-block-preview-button'));

    const previa = await screen.findByTestId('modal-bulk-block-preview');
    const tModal = createTranslator({
      locale: 'pt-BR',
      messages: ptBR,
      namespace: 'bulkBlockModal',
    });
    const esperado = [
      tModal('previa.sessionsToCancel', { sessionsToCancel: 3 }),
      tModal('previa.slotsToBlock', { slotsToBlock: 6 }),
    ];
    for (const texto of esperado) expect(texto).not.toContain('bulkBlockModal.');
    expect(esperado).toEqual([
      'até 3 sessões serão canceladas',
      'pelo menos 6 slots serão bloqueados',
    ]);
    expect(within(previa).getAllByRole('listitem').map((item) => item.textContent)).toEqual(esperado);
  });
});
