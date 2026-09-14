/**
 * GAP-04 ST005 - AvailabilityEditor: submit, block, unblock, delete, feedback e
 * callback de refresh.
 *
 * `@/lib/api-client` real (sem mock). O `fetch` e stubado com roteamento por
 * metodo e caminho e guarda cada chamada com o corpo; rota nao declarada lanca,
 * o que vira NETWORK_ERROR e um `toast.error` que os casos felizes proibem.
 *
 * O stub responde `GET /api/v1/admin/settings` no formato pos-GAP-07
 * (`{ data: { timezone } }`) com um fuso diferente do literal que o GAP-07
 * removeu do schema: o `timezone` do POST prova que a fonte e a leitura de
 * app_settings, e nao um default fixo.
 *
 * Todos os casos sao regressao (esperado verde). Cada caso 2xx e 403 assere a
 * ausencia de `auth:expired`; o E1 prova que o listener esta ligado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';

const FUSO_SETTINGS = 'Europe/Rome';
const ACESSO_RESTRITO = 'Acesso restrito a administradores.';
const SLOT_OCUPADO = 'Não é possível deletar slot com sessão associada.';

const SLOT_LIVRE = {
  id: 'slot-gap04-livre',
  startAt: '2030-01-15T13:00:00.000Z',
  endAt: '2030-01-15T13:50:00.000Z',
  isBlocked: false,
};

const SLOT_BLOQUEADO = {
  id: 'slot-gap04-bloqueado',
  startAt: '2030-01-16T13:00:00.000Z',
  endAt: '2030-01-16T13:50:00.000Z',
  isBlocked: true,
};

type Chamada = { metodo: string; caminho: string; corpo: unknown };
type Rota = () => Response | Promise<Response>;

let chamadas: Chamada[] = [];
let rotas: Record<string, Rota> = {};

function responder(metodo: string, caminho: string, rota: Rota) {
  rotas[`${metodo} ${caminho}`] = rota;
}

function resposta(status: number, corpo?: unknown): Response {
  // 204 nao admite corpo.
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chamadasDe(metodo: string, caminho: string) {
  return chamadas.filter((c) => c.metodo === metodo && c.caminho === caminho);
}

// O stub ignora o `signal`: o AbortSignal do jsdom nao e aceito pelo fetch do Node.
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const caminho = new URL(String(input), 'http://localhost').pathname;
  chamadas.push({ metodo, caminho, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
  const rota = rotas[`${metodo} ${caminho}`];
  if (!rota) throw new Error(`rota nao stubada: ${metodo} ${caminho}`);
  return rota();
});

const expirou = vi.fn();
const onSlotsGenerated = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  chamadas = [];
  rotas = {};
  responder('GET', '/api/v1/admin/settings', () =>
    resposta(200, { data: { timezone: FUSO_SETTINGS }, error: null }),
  );
  vi.stubGlobal('fetch', fetchStub);
  window.addEventListener('auth:expired', expirou);
});

afterEach(() => {
  window.removeEventListener('auth:expired', expirou);
  vi.unstubAllGlobals();
});

async function montar() {
  const utils = render(
    <AvailabilityEditor existingSlots={[SLOT_LIVRE, SLOT_BLOQUEADO]} onSlotsGenerated={onSlotsGenerated} />,
  );
  // Leitura do fuso respondida antes de qualquer acao (AvailabilityEditor.tsx:75-105).
  await waitFor(() => expect(chamadasDe('GET', '/api/v1/admin/settings')).toHaveLength(1));
  return utils;
}

describe('AvailabilityEditor - geracao de horarios (GAP-04)', () => {
  it('A1 submit feliz: POST com o corpo do form e o fuso lido, toast de sucesso e callback 1 vez', async () => {
    responder('POST', '/api/v1/availability', () => resposta(201, { data: { created: 3, skipped: 0 }, error: null }));
    const { user } = await montar();

    await user.click(screen.getByTestId('form-generate-slots-day-1-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('3 horário(s) criado(s).'));
    const posts = chamadasDe('POST', '/api/v1/availability');
    expect(posts).toHaveLength(1);
    expect(posts[0].corpo).toEqual({
      days: [1],
      ranges: [{ start: '09:00', end: '17:00' }],
      weeksAhead: 4,
      timezone: FUSO_SETTINGS,
    });
    expect(onSlotsGenerated).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('A2 submit com ignorados: alerta inline no lugar do toast e callback 1 vez', async () => {
    responder('POST', '/api/v1/availability', () => resposta(201, { data: { created: 1, skipped: 2 }, error: null }));
    const { user } = await montar();

    await user.click(screen.getByTestId('form-generate-slots-day-1-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));

    const alerta = await screen.findByTestId('form-generate-slots-skipped-alert');
    expect(alerta).toBeVisible();
    expect(alerta).toHaveTextContent('2 ignorado(s)');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSlotsGenerated).toHaveBeenCalledTimes(1);
    expect(expirou).not.toHaveBeenCalled();
  });

  it('A3 submit sem dia: erro de dias na tela e nenhum POST', async () => {
    const { user } = await montar();

    await user.click(screen.getByTestId('form-generate-slots-submit-button'));

    expect(await screen.findByTestId('form-generate-slots-days-error')).toBeVisible();
    expect(chamadasDe('POST', '/api/v1/availability')).toHaveLength(0);
    expect(onSlotsGenerated).not.toHaveBeenCalled();
  });

  it('A4 submit 403: toast com a mensagem do requireAdmin, sem callback, sem auth:expired e botao de volta', async () => {
    responder('POST', '/api/v1/availability', () => resposta(403, { data: null, error: ACESSO_RESTRITO }));
    const { user } = await montar();

    await user.click(screen.getByTestId('form-generate-slots-day-1-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(ACESSO_RESTRITO));
    expect(onSlotsGenerated).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
    const botao = screen.getByTestId('form-generate-slots-submit-button');
    await waitFor(() => expect(botao).toHaveTextContent('Gerar horários'));
    expect(botao).toBeEnabled();
  });
});

describe('AvailabilityEditor - acoes por slot (GAP-04)', () => {
  const BLOCK_LIVRE = `/api/v1/availability/${SLOT_LIVRE.id}/block`;
  const UNBLOCK_BLOQUEADO = `/api/v1/availability/${SLOT_BLOQUEADO.id}/unblock`;
  const DELETE_LIVRE = `/api/v1/availability/${SLOT_LIVRE.id}`;

  it('B1 block feliz: PATCH .../block com corpo {}, toast Slot bloqueado. e callback 1 vez', async () => {
    responder('PATCH', BLOCK_LIVRE, () => resposta(200, { data: null, error: null, message: 'Slot bloqueado.' }));
    const { user } = await montar();

    const botao = screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-block-button`);
    expect(botao).toHaveAttribute('aria-label', 'Bloquear');
    await user.click(botao);

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Slot bloqueado.'));
    const patches = chamadasDe('PATCH', BLOCK_LIVRE);
    expect(patches).toHaveLength(1);
    expect(patches[0].corpo).toEqual({});
    expect(onSlotsGenerated).toHaveBeenCalledTimes(1);
    expect(expirou).not.toHaveBeenCalled();
  });

  it('B2 block 403: toast.error com a mensagem do servidor, sem callback e sem auth:expired', async () => {
    responder('PATCH', BLOCK_LIVRE, () => resposta(403, { data: null, error: ACESSO_RESTRITO }));
    const { user } = await montar();

    await user.click(screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-block-button`));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(ACESSO_RESTRITO));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSlotsGenerated).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('B3 block pendente: o botao fica desabilitado durante a espera e volta habilitado depois', async () => {
    let liberar: ((r: Response) => void) | undefined;
    responder('PATCH', BLOCK_LIVRE, () => new Promise<Response>((r) => { liberar = r; }));
    const { user } = await montar();

    const botao = screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-block-button`);
    expect(botao).toBeEnabled();
    await user.click(botao);

    await waitFor(() => expect(chamadasDe('PATCH', BLOCK_LIVRE)).toHaveLength(1));
    await waitFor(() => expect(botao).toBeDisabled());
    expect(mocks.toast.success).not.toHaveBeenCalled();

    await act(async () => {
      liberar?.(resposta(200, { data: null, error: null, message: 'Slot bloqueado.' }));
    });

    await waitFor(() => expect(botao).toBeEnabled());
    expect(mocks.toast.success).toHaveBeenCalledWith('Slot bloqueado.');
  });

  it('C1 unblock feliz: PATCH .../unblock, toast Slot desbloqueado. e callback 1 vez', async () => {
    responder('PATCH', UNBLOCK_BLOQUEADO, () => resposta(200, { data: null, error: null, message: 'Slot desbloqueado.' }));
    const { user } = await montar();

    const botao = screen.getByTestId(`admin-availability-slot-${SLOT_BLOQUEADO.id}-block-button`);
    expect(botao).toHaveAttribute('aria-label', 'Desbloquear');
    await user.click(botao);

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Slot desbloqueado.'));
    const patches = chamadasDe('PATCH', UNBLOCK_BLOQUEADO);
    expect(patches).toHaveLength(1);
    expect(patches[0].corpo).toEqual({});
    expect(onSlotsGenerated).toHaveBeenCalledTimes(1);
    expect(expirou).not.toHaveBeenCalled();
  });

  it('C2 unblock 403: toast.error com a mensagem do servidor, sem callback e sem auth:expired', async () => {
    responder('PATCH', UNBLOCK_BLOQUEADO, () => resposta(403, { data: null, error: ACESSO_RESTRITO }));
    const { user } = await montar();

    await user.click(screen.getByTestId(`admin-availability-slot-${SLOT_BLOQUEADO.id}-block-button`));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(ACESSO_RESTRITO));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSlotsGenerated).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('D1 delete feliz: DELETE do slot com 204 sem corpo, toast Slot removido. e callback 1 vez', async () => {
    responder('DELETE', DELETE_LIVRE, () => resposta(204));
    const { user } = await montar();

    const botao = screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-delete-button`);
    expect(botao).toHaveAttribute('aria-label', 'Remover slot');
    await user.click(botao);

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Slot removido.'));
    expect(chamadasDe('DELETE', DELETE_LIVRE)).toHaveLength(1);
    expect(onSlotsGenerated).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('D2 delete 403: toast.error com a mensagem do servidor, sem callback e sem auth:expired', async () => {
    responder('DELETE', DELETE_LIVRE, () => resposta(403, { data: null, error: ACESSO_RESTRITO }));
    const { user } = await montar();

    await user.click(screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-delete-button`));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(ACESSO_RESTRITO));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSlotsGenerated).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('D3 delete 409: toast.error com a mensagem de slot ocupado e sem callback', async () => {
    responder('DELETE', DELETE_LIVRE, () =>
      resposta(409, { data: null, error: SLOT_OCUPADO, code: 'AVAILABILITY_060' }),
    );
    const { user } = await montar();

    await user.click(screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-delete-button`));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(SLOT_OCUPADO));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSlotsGenerated).not.toHaveBeenCalled();
    expect(expirou).not.toHaveBeenCalled();
  });

  it('E1 controle: PATCH block com 401 dispara auth:expired 1 vez', async () => {
    responder('PATCH', BLOCK_LIVRE, () =>
      resposta(401, { data: null, error: 'Sessão invalidada. Faça login novamente.' }),
    );
    const { user } = await montar();

    await user.click(screen.getByTestId(`admin-availability-slot-${SLOT_LIVRE.id}-block-button`));

    await waitFor(() => expect(expirou).toHaveBeenCalledTimes(1));
    expect(onSlotsGenerated).not.toHaveBeenCalled();
  });
});
