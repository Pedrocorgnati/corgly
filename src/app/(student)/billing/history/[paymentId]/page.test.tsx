import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingPaymentDetailPage from './page';

const mockUseParams = vi.hoisted(() => vi.fn(() => ({ paymentId: 'pay-1' })));

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const payment = {
  id: 'pay-1',
  createdAt: '2026-06-18T12:00:00.000Z',
  description: 'Compra de 1 crédito',
  amount: 2500,
  currency: 'usd',
  status: 'SUCCEEDED',
  receiptAvailable: true,
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function historyResponse(items: unknown[], nextCursor: string | null = null) {
  return jsonResponse({ data: { items, nextCursor }, error: null, message: null });
}

describe('BillingPaymentDetailPage', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ paymentId: 'pay-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('exibe already-requested quando já existe pedido no carregamento', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(historyResponse([payment]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            refundRequest: {
              id: 'rr-1',
              paymentId: 'pay-1',
              userId: 'user-1',
              reason: 'Motivo',
              status: 'PENDING',
              createdAt: '2026-06-18T12:00:00.000Z',
              updatedAt: '2026-06-18T12:00:00.000Z',
            },
          },
          error: null,
          message: null,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<BillingPaymentDetailPage />);

    expect(await screen.findByText('Pedido já registrado anteriormente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar pedido/i })).not.toBeInTheDocument();
  });

  it('continua paginando o histórico até encontrar o pagamento', async () => {
    const fetchMock = vi.fn();
    for (let index = 0; index < 8; index += 1) {
      fetchMock.mockResolvedValueOnce(historyResponse([], `cursor-${index}`));
    }
    fetchMock
      .mockResolvedValueOnce(historyResponse([payment]))
      .mockResolvedValueOnce(jsonResponse({ data: { refundRequest: null }, error: null, message: null }));
    vi.stubGlobal('fetch', fetchMock);

    render(<BillingPaymentDetailPage />);

    expect(await screen.findByText('Compra de 1 crédito')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('exibe estado inelegível para pagamento que não foi concluído', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(historyResponse([{ ...payment, status: 'FAILED' }])),
    );

    render(<BillingPaymentDetailPage />);

    expect(
      await screen.findByText('Este pagamento não está elegível para pedido de reembolso.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar pedido/i })).not.toBeInTheDocument();
  });

  it('exibe estado inelegível para pagamento concluído sem elegibilidade de refund', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(historyResponse([{ ...payment, refundEligible: false }]));
    vi.stubGlobal('fetch', fetchMock);

    render(<BillingPaymentDetailPage />);

    expect(
      await screen.findByText('Este pagamento não está elegível para pedido de reembolso.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar pedido/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envia motivo e exibe sucesso quando a API cria o pedido', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(historyResponse([payment]))
      .mockResolvedValueOnce(jsonResponse({ data: { refundRequest: null }, error: null, message: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            refundRequest: {
              id: 'rr-1',
              paymentId: 'pay-1',
              userId: 'user-1',
              reason: 'Motivo detalhado',
              status: 'PENDING',
              createdAt: '2026-06-18T12:00:00.000Z',
              updatedAt: '2026-06-18T12:00:00.000Z',
            },
            idempotentReplay: false,
          },
          error: null,
          message: 'Pedido de reembolso registrado com sucesso.',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<BillingPaymentDetailPage />);

    await user.type(await screen.findByLabelText('Motivo do reembolso'), 'Motivo detalhado');
    await user.click(screen.getByRole('button', { name: /enviar pedido/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/billing/refund-requests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ paymentId: 'pay-1', reason: 'Motivo detalhado' }),
        }),
      );
    });
    expect(await screen.findByText('Pedido registrado com sucesso.')).toBeInTheDocument();
  });
});
