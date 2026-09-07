import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkBlockModal } from '@/components/admin/BulkBlockModal';

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
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
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

  // C9.3 — o toast pos-execucao le as chaves reais do BulkCancelResult
  it('deve exibir os contadores reais no toast apos confirmar', async () => {
    mockGet.mockResolvedValueOnce({ data: { sessionsToCancel: 5, slotsToBlock: 9 } });
    mockPost.mockResolvedValueOnce({ data: { cancelled: 5, refunded: 3, blocked: 9 } });
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
});
