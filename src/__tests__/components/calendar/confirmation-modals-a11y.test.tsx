/**
 * Item 034 - Esc, clique no fundo e prisao de foco nos modais de confirmacao.
 *
 * `BookingConfirmModal` e `RescheduleFlow` sao modais proprios (nao Base UI):
 * ate este item nao fechavam por Esc nem por clique no fundo, e o Tab escapava
 * para a pagina atras do `aria-modal`.
 *
 * O que estes testes travam:
 *
 *  1. Esc e clique no fundo NAO sao um terceiro caminho de saida: cada estado
 *     fecha pelo mesmo handler do controle de fechar que mostra. Em `success`
 *     isso significa `onSuccess`/`onRescheduled`, nunca so o fechar simples;
 *  2. em `confirming` os dois ficam inertes. No agendamento a prova e a chave
 *     idempotente reaproveitada depois: se o `handleClose` tivesse rodado, a
 *     trava do item 032 teria sido limpa e a nova tentativa sairia com outra
 *     chave;
 *  3. clique dentro do painel nao fecha;
 *  4. Tab e Shift+Tab circulam so entre os focaveis do painel, e sem nenhum
 *     focavel (spinner) o foco fica no container do dialogo.
 */
import { act, fireEvent, render, screen, waitFor } from '@/test/utils';
import type userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bookSession: vi.fn(),
  getAvailability: vi.fn(),
  rescheduleSession: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  bookSession: mocks.bookSession,
  getAvailability: mocks.getAvailability,
  rescheduleSession: mocks.rescheduleSession,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import { RescheduleFlow } from '@/components/calendar/RescheduleFlow';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

type User = ReturnType<typeof userEvent.setup>;

interface Gesto {
  nome: string;
  executar: (user: User, dialogTestId: string) => Promise<void>;
}

const GESTOS: Gesto[] = [
  {
    nome: 'Esc',
    executar: (user) => user.keyboard('{Escape}'),
  },
  {
    nome: 'clique no fundo',
    executar: async (_user, dialogTestId) => {
      fireEvent.click(screen.getByTestId(dialogTestId));
    },
  },
];

function pendente<T>() {
  let resolver!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

/** Um dia futuro DENTRO do mes corrente, longe do aviso de reagendamento tardio. */
function diaAlvo(): string {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(hoje.getDate() + 3, ultimoDia);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── BookingConfirmModal ──

const BOOKING_DIALOG = 'modal-booking-confirm';

const SLOT = {
  id: 'slot-1',
  startAt: '2026-06-20T14:00:00.000Z',
  endAt: '2026-06-20T14:50:00.000Z',
  isBlocked: false,
} as AvailabilitySlot;

const onClose = vi.fn();
const onSuccess = vi.fn();

function renderBooking() {
  return render(
    <BookingConfirmModal
      slot={SLOT}
      studentTz="America/Sao_Paulo"
      adminTz="America/Sao_Paulo"
      open
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  );
}

async function levarBookingAoEstado(resposta: unknown, testid: string) {
  mocks.bookSession.mockResolvedValueOnce(resposta);
  fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));
  expect(await screen.findByTestId(testid)).toBeInTheDocument();
}

const ESTADOS_BOOKING_COM_FECHAR = [
  { estado: 'idle', resposta: null, testid: 'modal-booking-confirm-summary' },
  {
    estado: 'error',
    resposta: { data: null, error: 'Falha ao reservar.', code: null },
    testid: 'modal-booking-confirm-error',
  },
  {
    estado: 'conflict',
    resposta: {
      data: {
        alternatives: [
          { id: 'slot-2', startAt: '2026-06-20T15:00:00.000Z', endAt: '2026-06-20T15:50:00.000Z' },
        ],
      },
      error: 'Horario indisponivel.',
      code: 'SESSION_057',
    },
    testid: 'modal-booking-confirm-conflict',
  },
  {
    estado: 'insufficient_credits',
    resposta: { data: null, error: 'Creditos insuficientes.', code: 'INSUFFICIENT_CREDITS' },
    testid: 'modal-booking-confirm-insufficient-credits',
  },
];

describe.each(GESTOS)('BookingConfirmModal - $nome', ({ executar }) => {
  it.each(ESTADOS_BOOKING_COM_FECHAR)(
    'em $estado fecha pelo handleClose',
    async ({ resposta, testid }) => {
      const { user } = renderBooking();
      if (resposta) await levarBookingAoEstado(resposta, testid);

      await executar(user, BOOKING_DIALOG);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();
      // O reset do handleClose tambem rodou: o modal voltou ao resumo inicial.
      expect(screen.getByTestId('modal-booking-confirm-summary')).toBeInTheDocument();
    },
  );

  it('em success fecha pelo handleSuccessClose, sem pular o onSuccess', async () => {
    const { user } = renderBooking();
    await levarBookingAoEstado(
      { data: null, error: null, code: null },
      'modal-booking-confirm-success',
    );

    await executar(user, BOOKING_DIALOG);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('em confirming fica inerte e preserva a trava da reserva em voo', async () => {
    const reserva = pendente<unknown>();
    mocks.bookSession
      .mockReturnValueOnce(reserva.promise)
      .mockResolvedValueOnce({ data: null, error: null, code: null });
    const { user } = renderBooking();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));
    expect(await screen.findByTestId('modal-booking-confirm-loading')).toBeInTheDocument();

    await executar(user, BOOKING_DIALOG);

    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal-booking-confirm-loading')).toBeInTheDocument();

    await act(async () => {
      reserva.resolver({ data: null, error: 'Falha ao reservar.', code: null });
    });
    fireEvent.click(await screen.findByTestId('modal-booking-confirm-retry-button'));
    fireEvent.click(screen.getByTestId('modal-booking-confirm-submit-button'));
    expect(await screen.findByTestId('modal-booking-confirm-success')).toBeInTheDocument();

    // Mesma chave nas duas tentativas: o handleClose (que limpa as chaves) nao rodou.
    expect(mocks.bookSession).toHaveBeenCalledTimes(2);
    expect(mocks.bookSession.mock.calls[1]?.[1]).toBe(mocks.bookSession.mock.calls[0]?.[1]);
  });
});

describe('BookingConfirmModal - clique dentro do painel', () => {
  it('nao fecha em idle nem em success', async () => {
    renderBooking();

    fireEvent.click(screen.getByTestId('modal-booking-confirm-summary'));
    fireEvent.click(screen.getByTestId('modal-booking-confirm-header'));
    expect(onClose).not.toHaveBeenCalled();

    await levarBookingAoEstado(
      { data: null, error: null, code: null },
      'modal-booking-confirm-success',
    );
    fireEvent.click(screen.getByTestId('modal-booking-confirm-success'));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BookingConfirmModal - prisao de foco', () => {
  it('abre com foco no dialogo e Tab/Shift+Tab circulam entre os focaveis do painel', async () => {
    const { user } = renderBooking();
    const dialogo = screen.getByTestId(BOOKING_DIALOG);
    const cancelar = screen.getByTestId('modal-booking-confirm-cancel-button');
    const confirmar = screen.getByTestId('modal-booking-confirm-submit-button');

    expect(dialogo).toHaveFocus();

    await user.tab();
    expect(cancelar).toHaveFocus();
    await user.tab();
    expect(confirmar).toHaveFocus();
    await user.tab();
    expect(cancelar).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmar).toHaveFocus();
  });

  it('em confirming, sem focavel no painel, o foco fica no dialogo', async () => {
    const reserva = pendente<unknown>();
    mocks.bookSession.mockReturnValueOnce(reserva.promise);
    const { user } = renderBooking();
    const dialogo = screen.getByTestId(BOOKING_DIALOG);

    // O clique foca o botao, que desmonta ao entrar em confirming.
    await user.click(screen.getByTestId('modal-booking-confirm-submit-button'));
    expect(await screen.findByTestId('modal-booking-confirm-loading')).toBeInTheDocument();
    await waitFor(() => expect(dialogo).toHaveFocus());

    await user.tab();
    expect(dialogo).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialogo).toHaveFocus();

    await act(async () => {
      reserva.resolver({ data: null, error: null, code: null });
    });
  });

  it('ao fechar devolve o foco a quem estava focado antes da abertura', () => {
    const modal = (open: boolean) => (
      <>
        <button type="button" data-testid="gatilho">
          abrir
        </button>
        <BookingConfirmModal
          slot={SLOT}
          studentTz="America/Sao_Paulo"
          adminTz="America/Sao_Paulo"
          open={open}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </>
    );
    const { rerender } = render(modal(false));
    const gatilho = screen.getByTestId('gatilho');
    gatilho.focus();

    rerender(modal(true));
    expect(screen.getByTestId(BOOKING_DIALOG)).toHaveFocus();

    rerender(modal(false));
    expect(gatilho).toHaveFocus();
  });
});

// ── RescheduleFlow ──

const RESCHEDULE_DIALOG = 'modal-reschedule';
const DATA = diaAlvo();
const SESSAO = { id: 'sessao-1', startAt: `${DATA}T13:00:00.000Z` };
const SLOT_LIVRE = {
  id: 'slot-livre',
  startAt: `${DATA}T15:00:00.000Z`,
  endAt: `${DATA}T16:00:00.000Z`,
  isBlocked: false,
};

const onOpenChange = vi.fn();
const onRescheduled = vi.fn();

async function renderReschedule({ comErroDeCarga = false } = {}) {
  mocks.getAvailability.mockResolvedValue(
    comErroDeCarga
      ? { data: null, error: 'Falha ao carregar horarios' }
      : { data: [SLOT_LIVRE], error: null },
  );
  const tela = render(
    <RescheduleFlow
      session={SESSAO}
      studentTimezone="America/Sao_Paulo"
      adminTimezone="Europe/Rome"
      open
      onOpenChange={onOpenChange}
      onRescheduled={onRescheduled}
    />,
  );
  const esperado = comErroDeCarga ? 'modal-reschedule-load-error' : `schedule-slot-picker-idle`;
  expect(await screen.findByTestId(esperado)).toBeInTheDocument();
  return tela;
}

async function selecionarEConfirmar() {
  fireEvent.click(await screen.findByTestId(`calendar-view-day-${DATA}`));
  fireEvent.click(await screen.findByTestId(`schedule-slot-${SLOT_LIVRE.id}`));
  // O `handleConfirm` atualiza o estado depois do await do reagendamento.
  await act(async () => {
    fireEvent.click(screen.getByTestId('modal-reschedule-confirm-button'));
  });
}

describe.each(GESTOS)('RescheduleFlow - $nome', ({ executar }) => {
  it('em selecting fecha pelo handleClose', async () => {
    const { user } = await renderReschedule();

    await executar(user, RESCHEDULE_DIALOG);

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRescheduled).not.toHaveBeenCalled();
  });

  it('em selecting com loadError fecha pelo handleClose do cancelar montado', async () => {
    const { user } = await renderReschedule({ comErroDeCarga: true });
    expect(screen.getByTestId('modal-reschedule-cancel-button')).toBeInTheDocument();

    await executar(user, RESCHEDULE_DIALOG);

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRescheduled).not.toHaveBeenCalled();
  });

  it('em error fecha pelo handleClose', async () => {
    mocks.rescheduleSession.mockResolvedValueOnce({ data: null, error: 'Horario ocupado.' });
    const { user } = await renderReschedule();
    await selecionarEConfirmar();
    expect(await screen.findByTestId('modal-reschedule-error')).toBeInTheDocument();

    await executar(user, RESCHEDULE_DIALOG);

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRescheduled).not.toHaveBeenCalled();
    // O reset do handleClose tambem rodou: o fluxo voltou para a selecao.
    expect(screen.getByTestId('modal-reschedule-header')).toBeInTheDocument();
  });

  it('em success fecha pelo handleSuccessClose, sem pular o onRescheduled', async () => {
    mocks.rescheduleSession.mockResolvedValueOnce({ data: null, error: null });
    const { user } = await renderReschedule();
    await selecionarEConfirmar();
    expect(await screen.findByTestId('modal-reschedule-success')).toBeInTheDocument();

    await executar(user, RESCHEDULE_DIALOG);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRescheduled).toHaveBeenCalledTimes(1);
  });

  it('em confirming fica inerte com o reagendamento em voo', async () => {
    const reagendamento = pendente<unknown>();
    mocks.rescheduleSession.mockReturnValueOnce(reagendamento.promise);
    const { user } = await renderReschedule();
    await selecionarEConfirmar();
    expect(await screen.findByTestId('modal-reschedule-loading')).toBeInTheDocument();

    await executar(user, RESCHEDULE_DIALOG);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onRescheduled).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal-reschedule-loading')).toBeInTheDocument();

    await act(async () => {
      reagendamento.resolver({ data: null, error: null });
    });
    expect(await screen.findByTestId('modal-reschedule-success')).toBeInTheDocument();
  });
});

describe('RescheduleFlow - clique dentro do painel', () => {
  it('nao fecha', async () => {
    await renderReschedule();

    fireEvent.click(screen.getByTestId('modal-reschedule-header'));
    fireEvent.click(screen.getByTestId('modal-reschedule-actions'));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('RescheduleFlow - prisao de foco', () => {
  it('Tab/Shift+Tab circulam entre os focaveis do painel com a busca quebrada', async () => {
    const { user } = await renderReschedule({ comErroDeCarga: true });
    const tentarDeNovo = screen.getByTestId('modal-reschedule-load-error-retry-button');
    const cancelar = screen.getByTestId('modal-reschedule-cancel-button');

    expect(screen.getByTestId(RESCHEDULE_DIALOG)).toHaveFocus();

    await user.tab();
    expect(tentarDeNovo).toHaveFocus();
    await user.tab();
    expect(cancelar).toHaveFocus();
    await user.tab();
    expect(tentarDeNovo).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancelar).toHaveFocus();
  });

  it('em confirming, sem focavel no painel, o foco fica no dialogo', async () => {
    const reagendamento = pendente<unknown>();
    mocks.rescheduleSession.mockReturnValueOnce(reagendamento.promise);
    const { user } = await renderReschedule();
    const dialogo = screen.getByTestId(RESCHEDULE_DIALOG);

    fireEvent.click(await screen.findByTestId(`calendar-view-day-${DATA}`));
    fireEvent.click(await screen.findByTestId(`schedule-slot-${SLOT_LIVRE.id}`));
    // O clique foca o botao, que desmonta ao entrar em confirming.
    await user.click(screen.getByTestId('modal-reschedule-confirm-button'));
    expect(await screen.findByTestId('modal-reschedule-loading')).toBeInTheDocument();
    await waitFor(() => expect(dialogo).toHaveFocus());

    await user.tab();
    expect(dialogo).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialogo).toHaveFocus();

    await act(async () => {
      reagendamento.resolver({ data: null, error: null });
    });
  });
});
