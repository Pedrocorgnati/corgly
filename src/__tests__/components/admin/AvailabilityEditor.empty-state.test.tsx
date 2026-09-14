/**
 * GAP-04 ST001 - estado vazio do AvailabilityEditor.
 *
 * No HEAD PRED (0da0f00) a lista de slots existentes so renderiza quando
 * `existingSlots.length > 0` (AvailabilityEditor.tsx:333): sem slot nenhum, a
 * regiao abaixo do formulario some sem sinal (Zero Estados Indefinidos).
 *
 *  V1 [RED declarado]: `existingSlots={[]}` mostra `admin-availability-existing-empty`
 *     e nao mostra `admin-availability-slot-list`.
 *  V2 [regressao, controle]: com um slot, a linha do slot aparece e o estado
 *     vazio nao.
 *
 * O RED assere so estrutura (data-testid). A copy e a forma entram no ST010,
 * depois do gate ST009.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';

const SLOT = {
  id: 'slot-gap04-v2',
  startAt: '2030-01-15T13:00:00.000Z',
  endAt: '2030-01-15T13:50:00.000Z',
  isBlocked: false,
};

/**
 * Leitura do fuso depois do GAP-07 (AvailabilityEditor.tsx:75-97): o editor le
 * `GET /api/v1/admin/settings` e espera `{ data: { timezone } }`. A resposta de
 * sucesso evita alerta e toast de falha. O stub ignora o `signal`: o
 * AbortSignal do jsdom nao e aceito pelo fetch do Node.
 */
const fetchStub = vi.fn(
  async () =>
    new Response(JSON.stringify({ data: { timezone: 'America/Sao_Paulo' }, error: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AvailabilityEditor - estado vazio (GAP-04)', () => {
  it('V1 [RED declarado]: sem slots existentes mostra o estado vazio e nao a lista', async () => {
    render(<AvailabilityEditor existingSlots={[]} />);

    expect(await screen.findByTestId('admin-availability-existing-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-availability-slot-list')).not.toBeInTheDocument();
    // ST010, gate ST009: copy 2 e forma 1 (card e cabecalho com a contagem zero).
    expect(screen.getByTestId('admin-availability-existing-empty')).toHaveTextContent(
      'Nenhum horário cadastrado. Use o formulário acima para gerar horários.',
    );
    expect(screen.getByTestId('admin-availability-existing-header')).toHaveTextContent('Slots existentes (0)');
  });

  it('V2 [controle]: com um slot, a linha aparece e o estado vazio nao', async () => {
    render(<AvailabilityEditor existingSlots={[SLOT]} />);

    expect(await screen.findByTestId(`admin-availability-slot-${SLOT.id}`)).toBeInTheDocument();
    // A leitura do fuso ja respondeu: a ausencia abaixo nao passa por corrida.
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('admin-availability-existing-empty')).not.toBeInTheDocument();
  });
});
