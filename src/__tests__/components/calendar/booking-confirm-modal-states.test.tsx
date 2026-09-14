import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

const bookSessionMock = vi.fn();

vi.mock('@/actions/sessions', () => ({
  bookSession: (...args: unknown[]) => bookSessionMock(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/ui/timezone-display', () => ({
  TimezoneDisplay: ({ time }: { time: string }) => <span>{time}</span>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

const slot = {
  id: 'slot-1',
  startAt: '2026-06-20T14:00:00.000Z',
  endAt: '2026-06-20T14:50:00.000Z',
  isBlocked: false,
} as AvailabilitySlot;

function renderModal() {
  return render(
    <BookingConfirmModal
      slot={slot}
      studentTz="America/Sao_Paulo"
      adminTz="America/Sao_Paulo"
      open
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BookingConfirmModal: estados visiveis do caminho do aluno', () => {
  it('mostra o estado inicial com acao de confirmacao', () => {
    renderModal();

    expect(screen.getByTestId('modal-booking-confirm-summary')).toBeInTheDocument();
    expect(screen.getByTestId('modal-booking-confirm-submit-button')).toBeEnabled();
  });

  it('mostra carregamento enquanto a reserva esta pendente', async () => {
    let finish!: (value: { data: null; error: null; code: null }) => void;
    bookSessionMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderModal();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));
    expect(await screen.findByTestId('modal-booking-confirm-loading')).toBeInTheDocument();

    await act(async () => {
      finish({ data: null, error: null, code: null });
    });
  });

  it('reaproveita a chave idempotente e nao dispara duas reservas no duplo clique', async () => {
    let finish!: (value: { data: null; error: null; code: null }) => void;
    bookSessionMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderModal();

    const confirmButton = screen.getByTestId('modal-booking-confirm-submit-button');
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(bookSessionMock).toHaveBeenCalledTimes(1);
    expect(bookSessionMock).toHaveBeenCalledWith('slot-1', expect.any(String));

    await act(async () => {
      finish({ data: null, error: null, code: null });
    });
  });

  it('mostra erro recuperavel quando a API falha sem alternativas', async () => {
    bookSessionMock.mockResolvedValueOnce({
      data: null,
      error: 'Falha ao reservar.',
      code: null,
    });
    renderModal();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));

    expect(await screen.findByTestId('modal-booking-confirm-error')).toHaveTextContent(
      'Falha ao reservar.',
    );
    expect(screen.getByTestId('modal-booking-confirm-retry-button')).toBeEnabled();
  });

  it('mostra a acao de compra quando a API classifica saldo insuficiente', async () => {
    bookSessionMock.mockResolvedValueOnce({
      data: null,
      error: 'Créditos insuficientes.',
      code: 'INSUFFICIENT_CREDITS',
    });
    renderModal();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));

    expect(
      await screen.findByTestId('modal-booking-confirm-insufficient-credits'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-booking-confirm-buy-credits-button')).toHaveAttribute(
      'href',
      '/credits',
    );
  });

  it('mostra as alternativas do conflito e permite tentar a escolhida', async () => {
    bookSessionMock
      .mockResolvedValueOnce({
        data: {
          alternatives: [
            {
              id: 'slot-2',
              startAt: '2026-06-20T15:00:00.000Z',
              endAt: '2026-06-20T15:50:00.000Z',
            },
          ],
        },
        error: 'Horário indisponível.',
        code: 'SESSION_057',
      })
      .mockResolvedValueOnce({ data: null, error: null, code: null });
    renderModal();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));
    expect(await screen.findByTestId('modal-booking-confirm-conflict')).toHaveTextContent(
      'Horário indisponível.',
    );

    fireEvent.click(screen.getByTestId('modal-booking-confirm-alternative-slot-2'));

    expect(await screen.findByTestId('modal-booking-confirm-success')).toBeInTheDocument();
    expect(bookSessionMock).toHaveBeenNthCalledWith(1, 'slot-1', expect.any(String));
    expect(bookSessionMock).toHaveBeenNthCalledWith(2, 'slot-2', expect.any(String));
    expect(bookSessionMock.mock.calls[0]?.[1]).not.toBe(bookSessionMock.mock.calls[1]?.[1]);
  });
});
