/**
 * GAP-04 ST006 - tela de agenda: refresh apos acao do editor e cor do slot.
 *
 * Mesma montagem de `schedule-client.test.tsx:21-106`: `@/actions/sessions`
 * mockado, `sonner` mockado, dia alvo no mes corrente e fixtures de slot livre,
 * bloqueado e vendido. O `fetch` e stubado so para as chamadas do editor
 * (leitura do fuso e PATCH de bloqueio); rota nao declarada lanca.
 *
 *  R1: bloquear com 200 re-busca a agenda (`schedule-client.tsx:26-29` e
 *      `:116-119`; `refresh` = `fetchSlots` em `useAdminSchedule.ts:145`, que
 *      chama `getAdminAvailability` em `:57`) e fecha o editor. O fechamento
 *      documenta o `setShowEditor(false)` atual sem muda-lo (observacao para o
 *      GAP-17).
 *  R2: bloquear com 403 nao re-busca a agenda.
 *  K1: cor do slot no calendario, com a classe do vendido lida de
 *      `SESSION_STATUS_MAP` (como `AdminCalendar.tsx:7`), sem literal duplicado.
 *
 * Todos regressao, esperado verde.
 */
import { render, screen, fireEvent, waitFor } from '@/test/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '../../../../i18n/messages/pt-BR.json';
import { SESSION_STATUS_MAP } from '@/lib/constants/enums';

const mocks = vi.hoisted(() => ({
  getAdminAvailability: vi.fn(),
  getAvailability: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/actions/sessions', () => ({
  getAdminAvailability: mocks.getAdminAvailability,
  getAvailability: mocks.getAvailability,
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

import { AdminScheduleClient } from '@/app/(admin)/admin/schedule/schedule-client';

const ACESSO_RESTRITO = 'Acesso restrito a administradores.';

/** Dia futuro DENTRO do mes corrente, como em `schedule-client.test.tsx`. */
function diaAlvo(): string {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(hoje.getDate() + 3, ultimoDia);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const DATA = diaAlvo();

const SLOT_LIVRE = {
  id: 'slot-gap04-livre',
  startAt: `${DATA}T13:00:00.000Z`,
  endAt: `${DATA}T14:00:00.000Z`,
  isBlocked: false,
  session: null,
};

const SLOT_BLOQUEADO = {
  id: 'slot-gap04-bloqueado',
  startAt: `${DATA}T15:00:00.000Z`,
  endAt: `${DATA}T16:00:00.000Z`,
  isBlocked: true,
  session: null,
};

const SLOT_VENDIDO = {
  id: 'slot-gap04-vendido',
  startAt: `${DATA}T17:00:00.000Z`,
  endAt: `${DATA}T18:00:00.000Z`,
  isBlocked: false,
  session: { id: 'sessao-gap04', status: 'SCHEDULED', studentName: 'Aluna Teste' },
};

const BLOCK_LIVRE = `/api/v1/availability/${SLOT_LIVRE.id}/block`;

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let respostaDoBloqueio: () => Response;
let patches: string[] = [];

// O stub ignora o `signal`: o AbortSignal do jsdom nao e aceito pelo fetch do Node.
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const caminho = new URL(String(input), 'http://localhost').pathname;
  if (metodo === 'GET' && caminho === '/api/v1/admin/settings') {
    return resposta(200, { data: { timezone: 'America/Sao_Paulo' }, error: null });
  }
  if (metodo === 'PATCH' && caminho === BLOCK_LIVRE) {
    patches.push(caminho);
    return respostaDoBloqueio();
  }
  throw new Error(`rota nao stubada: ${metodo} ${caminho}`);
});

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

/** Abre o editor depois da primeira carga e devolve o botao de bloqueio do slot livre. */
async function abrirEditor() {
  await waitFor(() => expect(mocks.getAdminAvailability).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('admin-schedule-create-button'));
  const botao = await screen.findByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-block-button`);
  expect(botao).toHaveAttribute('aria-label', 'Bloquear');
  return botao;
}

beforeEach(() => {
  vi.clearAllMocks();
  patches = [];
  respostaDoBloqueio = () => resposta(200, { data: null, error: null, message: 'Slot bloqueado.' });
  mocks.getAdminAvailability.mockResolvedValue({
    data: [SLOT_LIVRE, SLOT_BLOQUEADO, SLOT_VENDIDO],
    error: null,
  });
  mocks.getAvailability.mockResolvedValue({
    data: [{ id: SLOT_LIVRE.id, startAt: SLOT_LIVRE.startAt, endAt: SLOT_LIVRE.endAt, isBlocked: false }],
    error: null,
  });
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminScheduleClient - acoes do editor e cor do slot (GAP-04)', () => {
  it('R1 bloquear com 200 re-busca a agenda do mes e fecha o editor', async () => {
    renderizar();
    const botao = await abrirEditor();
    // Carga inicial concluida: o editor ja recebeu os slots.
    const n = mocks.getAdminAvailability.mock.calls.length;

    fireEvent.click(botao);

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Slot bloqueado.'));
    expect(patches).toEqual([BLOCK_LIVRE]);
    await waitFor(() => expect(mocks.getAdminAvailability.mock.calls.length).toBeGreaterThan(n));
    expect(mocks.getAdminAvailability).toHaveBeenLastCalledWith(DATA.slice(0, 7), undefined);
    // Comportamento atual de `schedule-client.tsx:118`, documentado e nao alterado (GAP-17).
    await waitFor(() => expect(screen.queryByTestId('admin-availability')).not.toBeInTheDocument());
  });

  it('R2 bloquear com 403 nao re-busca a agenda', async () => {
    respostaDoBloqueio = () => resposta(403, { data: null, error: ACESSO_RESTRITO });
    renderizar();
    const botao = await abrirEditor();
    const n = mocks.getAdminAvailability.mock.calls.length;

    fireEvent.click(botao);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(ACESSO_RESTRITO));
    expect(patches).toEqual([BLOCK_LIVRE]);
    await waitFor(() => expect(botao).toBeEnabled());
    expect(mocks.getAdminAvailability).toHaveBeenCalledTimes(n);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-availability')).toBeInTheDocument();
  });

  it('K1 cor do slot: bloqueado bg-muted, livre bg-emerald-50 e vendido com a classe de SESSION_STATUS_MAP.SCHEDULED', async () => {
    renderizar();
    await selecionarDia();

    const vendido = await screen.findByTestId(`admin-calendar-slot-${SLOT_VENDIDO.id}`);
    const bloqueado = screen.getByTestId(`admin-calendar-slot-${SLOT_BLOQUEADO.id}`);
    const livre = screen.getByTestId(`admin-calendar-slot-${SLOT_LIVRE.id}`);

    expect(bloqueado).toHaveClass('bg-muted');
    expect(livre).toHaveClass('bg-emerald-50');
    expect(vendido).toHaveClass(SESSION_STATUS_MAP.SCHEDULED.bg);

    // As tres classes sao exclusivas: nenhuma assercao acima passa por classe compartilhada.
    expect(livre).not.toHaveClass('bg-muted');
    expect(livre).not.toHaveClass(SESSION_STATUS_MAP.SCHEDULED.bg);
    expect(bloqueado).not.toHaveClass('bg-emerald-50');
    expect(bloqueado).not.toHaveClass(SESSION_STATUS_MAP.SCHEDULED.bg);
    expect(vendido).not.toHaveClass('bg-muted');
    expect(vendido).not.toHaveClass('bg-emerald-50');
  });
});
