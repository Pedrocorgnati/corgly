/**
 * Item 006 - fiacao do painel de agenda do professor.
 *
 * O `schedule-client` montava `<AdminCalendar />` sem nenhuma prop: sem
 * `sessions`, sem `onSlotClick`, sem fonte de dados propria, e montava o
 * `AvailabilityEditor` sem `existingSlots`. O calendario caia no
 * `useCalendar` publico, que so enxerga slot LIVRE (a rota publica filtra
 * `isBlocked: false` e slots sem sessao ocupante). Consequencia: a cor por
 * status era codigo morto por DADO, o clique no slot nao levava a lugar
 * nenhum e o botao "Desbloquear" nunca renderizava porque nenhum slot
 * bloqueado chegava ao editor.
 *
 * O que estes testes travam:
 *
 *  1. slot vendido e slot bloqueado chegam ao calendario e o rotulo traduzido
 *     do status ("Agendada") aparece na lista do dia;
 *  2. clicar num slot produz efeito observavel na tela (painel de detalhe);
 *  3. o editor recebe `existingSlots`, e o slot bloqueado expoe o botao de
 *     desbloqueio.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  getAdminAvailability: vi.fn(),
  getAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAdminAvailability: mocks.getAdminAvailability,
  getAvailability: mocks.getAvailability,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AdminScheduleClient } from '@/app/(admin)/admin/schedule/schedule-client';

/**
 * Um dia futuro DENTRO do mes corrente: o hook abre no mes de hoje e o
 * `CalendarView` desabilita dias passados.
 */
function diaAlvo(): string {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(hoje.getDate() + 3, ultimoDia);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const DATA = diaAlvo();

const SLOT_LIVRE = {
  id: 'slot-livre',
  startAt: `${DATA}T13:00:00.000Z`,
  endAt: `${DATA}T14:00:00.000Z`,
  isBlocked: false,
  session: null,
};

const SLOT_BLOQUEADO = {
  id: 'slot-bloqueado',
  startAt: `${DATA}T15:00:00.000Z`,
  endAt: `${DATA}T16:00:00.000Z`,
  isBlocked: true,
  session: null,
};

const SLOT_VENDIDO = {
  id: 'slot-vendido',
  startAt: `${DATA}T17:00:00.000Z`,
  endAt: `${DATA}T18:00:00.000Z`,
  isBlocked: false,
  session: { id: 'sessao-1', status: 'SCHEDULED', studentName: 'Aluna Teste' },
};

function renderizar() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <AdminScheduleClient />
    </NextIntlClientProvider>,
  );
}

async function selecionarDia() {
  await waitFor(() => {
    expect(screen.getByTestId(`calendar-view-day-${DATA}`)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId(`calendar-view-day-${DATA}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminAvailability.mockResolvedValue({
    data: [SLOT_LIVRE, SLOT_BLOQUEADO, SLOT_VENDIDO],
    error: null,
  });
  // A rota publica nao deve alimentar esta tela; se for chamada, devolve o
  // recorte pobre de sempre (so o slot livre).
  mocks.getAvailability.mockResolvedValue({
    data: [{ id: SLOT_LIVRE.id, startAt: SLOT_LIVRE.startAt, endAt: SLOT_LIVRE.endAt, isBlocked: false }],
    error: null,
  });
});

describe('AdminScheduleClient - fiacao da agenda do professor', () => {
  it('mostra o slot vendido com o rotulo traduzido do status e o slot bloqueado na lista do dia', async () => {
    renderizar();
    await selecionarDia();

    await waitFor(() => {
      expect(screen.getByTestId(`admin-calendar-slot-${SLOT_VENDIDO.id}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId(`admin-calendar-slot-${SLOT_BLOQUEADO.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`admin-calendar-slot-${SLOT_LIVRE.id}`)).toBeInTheDocument();

    const vendido = screen.getByTestId(`admin-calendar-slot-${SLOT_VENDIDO.id}`);
    expect(vendido).toHaveTextContent(ptBR.sessionStatus.SCHEDULED);
    expect(vendido).toHaveTextContent('Aluna Teste');

    expect(screen.getByTestId(`admin-calendar-slot-${SLOT_BLOQUEADO.id}`)).toHaveTextContent('Bloqueado');
  });

  it('clicar num slot produz efeito observavel na tela', async () => {
    renderizar();
    await selecionarDia();

    await waitFor(() => {
      expect(screen.getByTestId(`admin-calendar-slot-${SLOT_VENDIDO.id}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('admin-schedule-slot-detail')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`admin-calendar-slot-${SLOT_VENDIDO.id}`));

    const detalhe = await screen.findByTestId('admin-schedule-slot-detail');
    expect(detalhe).toHaveTextContent('Aluna Teste');
    // O bloco "Proximas aulas" continua na tela.
    expect(screen.getByText('Próximas aulas')).toBeInTheDocument();
  });

  it('entrega existingSlots ao editor, com botao de desbloqueio no slot bloqueado', async () => {
    renderizar();

    await waitFor(() => {
      expect(mocks.getAdminAvailability).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('admin-schedule-create-button'));

    const existentes = await screen.findByTestId('admin-availability-existing');
    expect(existentes).toBeInTheDocument();
    expect(screen.getByTestId(`admin-availability-slot-${SLOT_BLOQUEADO.id}`)).toBeInTheDocument();

    const botaoBloqueio = screen.getByTestId(`admin-availability-slot-${SLOT_BLOQUEADO.id}-block-button`);
    expect(botaoBloqueio).toHaveAttribute('aria-label', 'Desbloquear');
  });
});
