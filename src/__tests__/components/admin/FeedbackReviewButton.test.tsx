import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackReviewButton } from '@/components/admin/FeedbackReviewButton';

// Mock apiClient
const mockPatch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

describe('FeedbackReviewButton', () => {
  beforeEach(() => {
    mockPatch.mockReset();
  });

  it('renderiza botao "Marcar como revisado" quando nao revisado', () => {
    render(<FeedbackReviewButton feedbackId="fb-1" initialReviewed={false} />);
    expect(screen.getByRole('button', { name: /marcar como revisado/i })).toBeInTheDocument();
  });

  it('exibe estado "Revisado" quando ja revisado', () => {
    render(<FeedbackReviewButton feedbackId="fb-1" initialReviewed={true} />);
    expect(screen.getByText('Revisado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('chama API ao clicar e muda para estado revisado', async () => {
    mockPatch.mockResolvedValueOnce({});
    render(<FeedbackReviewButton feedbackId="fb-123" initialReviewed={false} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Revisado')).toBeInTheDocument();
    });

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/admin/feedback/fb-123/review', {});
  });

  it('exibe estado de loading durante chamada API', async () => {
    let resolvePromise: (v: unknown) => void;
    mockPatch.mockReturnValue(new Promise((r) => { resolvePromise = r; }));

    render(<FeedbackReviewButton feedbackId="fb-1" initialReviewed={false} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Marcando...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    resolvePromise!({});
    await waitFor(() => {
      expect(screen.getByText('Revisado')).toBeInTheDocument();
    });
  });

  it('exibe mensagem de erro quando API falha', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Network error'));

    render(<FeedbackReviewButton feedbackId="fb-1" initialReviewed={false} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Erro ao marcar como revisado. Tente novamente.')).toBeInTheDocument();
    });

    // Button should still be available for retry
    expect(screen.getByRole('button', { name: /marcar como revisado/i })).toBeInTheDocument();
  });
});
