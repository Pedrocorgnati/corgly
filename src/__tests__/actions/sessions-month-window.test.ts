/**
 * GAP-08 - janela do mes nas server actions da agenda (`src/actions/sessions.ts`).
 *
 * `getAvailability`, `getOwnReservedSlots` e `getAdminAvailability` pediam o mes
 * em dias UTC (`date=AAAA-MM-01`, `until` no dia 1 seguinte). Com fuso, o mes
 * passa a ser [00:00 local do dia 1, 00:00 local do dia 1 seguinte): a busca
 * cobre os dias UTC dessa janela e o resultado e recortado nela. Sem fuso, o
 * comportamento de antes fica igual.
 *
 * `vi.stubGlobal('fetch', ...)` no lugar de handler MSW, como em
 * `sessions-apifetch.test.ts`: o stub global da controle da URL pedida e do corpo.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'corgly_token=jwt-de-teste' }),
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getAdminAvailability, getAvailability, getOwnReservedSlots } from '@/actions/sessions';

function resposta(status: number, body: BodyInit | null, contentType = 'application/json') {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

function stubFetch(res: Response) {
  const spy = vi.fn(async () => res);
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchMock = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;

/** Corpo de `Response` so pode ser lido uma vez: cada chamada recebe uma resposta nova. */
function stubFetchJson(corpo: unknown): FetchMock {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => resposta(200, JSON.stringify(corpo)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function caminhoPedido(fetchMock: FetchMock, i = 0): string {
  const u = new URL(String(fetchMock.mock.calls[i][0]));
  return u.pathname + u.search;
}

function parametroPedido(fetchMock: FetchMock, nome: string, i = 0): string | null {
  const u = new URL(String(fetchMock.mock.calls[i][0]));
  return u.searchParams.get(nome);
}

const SLOTS_BORDA_SP = [
  { id: 's-antes', startAt: '2026-09-01T02:30:00.000Z', endAt: '2026-09-01T03:20:00.000Z', isBlocked: false },
  { id: 's-inicio', startAt: '2026-09-01T03:00:00.000Z', endAt: '2026-09-01T03:50:00.000Z', isBlocked: false },
  { id: 's-borda', startAt: '2026-10-01T02:30:00.000Z', endAt: '2026-10-01T03:20:00.000Z', isBlocked: false },
  { id: 's-depois', startAt: '2026-10-01T03:00:00.000Z', endAt: '2026-10-01T03:50:00.000Z', isBlocked: false },
];

const SEM_SESSOES = { data: { data: [], totalPages: 1 }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('getAvailability - janela do mes no fuso do aluno (GAP-08)', () => {
  it('RED: A1 Sao Paulo 2026-09 pede ate 2026-10-02 exclusivo', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-09', 'America/Sao_Paulo');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-09-01&until=2026-10-02');
  });

  it('RED: A2 Kiritimati 2026-09 comeca no dia UTC anterior', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-09', 'Pacific/Kiritimati');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-08-31&until=2026-10-01');
  });

  it('RED: A3 Pago_Pago 2026-09 estende o until em um dia', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-09', 'Pacific/Pago_Pago');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-09-01&until=2026-10-02');
  });

  it('RED: A4 Sao Paulo 2026-12 atravessa o ano', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-12', 'America/Sao_Paulo');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-12-01&until=2027-01-02');
  });

  it('RED: A5 Kiritimati 2027-01 comeca no ano anterior', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2027-01', 'Pacific/Kiritimati');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-12-31&until=2027-02-01');
  });

  it('REGRESSAO: A6 UTC 2026-09 pede o mes exato', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-09', 'UTC');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-09-01&until=2026-10-01');
  });

  it('REGRESSAO: A7 UTC 2026-12 pede o mes exato atravessando o ano', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-12', 'UTC');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-12-01&until=2027-01-01');
  });

  it('REGRESSAO: A8 sem fuso mantem o pedido de antes', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAvailability('2026-12');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/availability?date=2026-12-01&until=2027-01-01');
  });

  it('RED: A9 Sao Paulo 2026-09 recorta os slots na janela civil', async () => {
    stubFetchJson({ data: SLOTS_BORDA_SP, error: null });
    const result = await getAvailability('2026-09', 'America/Sao_Paulo');
    expect(result.data?.map((s) => s.id)).toEqual(['s-inicio', 's-borda']);
  });

  it('REGRESSAO: A10 sem fuso devolve os slots na ordem recebida', async () => {
    stubFetchJson({ data: SLOTS_BORDA_SP, error: null });
    const result = await getAvailability('2026-09');
    expect(result.data?.map((s) => s.id)).toEqual(['s-antes', 's-inicio', 's-borda', 's-depois']);
  });

  it('CONTROLE: A19 mes fora do formato devolve erro sem buscar nada', async () => {
    const spy = stubFetch(resposta(200, JSON.stringify({ data: [], error: null })));
    const result = await getAvailability('2026-9', 'America/Sao_Paulo');
    expect(result).toEqual({ data: null, error: 'Mês inválido. Use formato YYYY-MM.', code: null });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('getOwnReservedSlots - reservas do mes no fuso do aluno (GAP-08)', () => {
  it('RED: A11 Sao Paulo 2026-09 pede from e to da janela civil', async () => {
    const fetchMock = stubFetchJson(SEM_SESSOES);
    await getOwnReservedSlots('2026-09', 'America/Sao_Paulo');
    expect(parametroPedido(fetchMock, 'from')).toBe('2026-09-01T03:00:00.000Z');
    expect(parametroPedido(fetchMock, 'to')).toBe('2026-10-01T02:59:59.999Z');
  });

  it('RED: A12 Kiritimati 2027-01 pede from e to da janela civil', async () => {
    const fetchMock = stubFetchJson(SEM_SESSOES);
    await getOwnReservedSlots('2027-01', 'Pacific/Kiritimati');
    expect(parametroPedido(fetchMock, 'from')).toBe('2026-12-31T10:00:00.000Z');
    expect(parametroPedido(fetchMock, 'to')).toBe('2027-01-31T09:59:59.999Z');
  });

  it('RED: A13 Sao Paulo 2026-12 pede from e to atravessando o ano', async () => {
    const fetchMock = stubFetchJson(SEM_SESSOES);
    await getOwnReservedSlots('2026-12', 'America/Sao_Paulo');
    expect(parametroPedido(fetchMock, 'from')).toBe('2026-12-01T03:00:00.000Z');
    expect(parametroPedido(fetchMock, 'to')).toBe('2027-01-01T02:59:59.999Z');
  });

  it('REGRESSAO: A14 sem fuso e com UTC pedem o mes UTC de antes', async () => {
    const fetchMock = stubFetchJson(SEM_SESSOES);
    await getOwnReservedSlots('2026-09');
    await getOwnReservedSlots('2026-09', 'UTC');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const i of [0, 1]) {
      expect(parametroPedido(fetchMock, 'from', i)).toBe('2026-09-01T00:00:00.000Z');
      expect(parametroPedido(fetchMock, 'to', i)).toBe('2026-09-30T23:59:59.999Z');
    }
  });

  it('RED: A15 Sao Paulo 2026-09 recorta as reservas na janela civil', async () => {
    stubFetchJson({
      data: {
        data: [
          {
            id: 'sess-antes',
            availabilitySlotId: 'slot-antes',
            status: 'SCHEDULED',
            startAt: '2026-09-01T01:40:00.000Z',
            endAt: '2026-09-01T02:30:00.000Z',
          },
          {
            id: 'sess-borda',
            availabilitySlotId: 'slot-borda',
            status: 'SCHEDULED',
            startAt: '2026-10-01T01:40:00.000Z',
            endAt: '2026-10-01T02:30:00.000Z',
          },
          {
            id: 'sess-depois',
            availabilitySlotId: 'slot-depois',
            status: 'SCHEDULED',
            startAt: '2026-10-01T03:50:00.000Z',
            endAt: '2026-10-01T04:40:00.000Z',
          },
        ],
        totalPages: 1,
      },
      error: null,
    });
    const result = await getOwnReservedSlots('2026-09', 'America/Sao_Paulo');
    expect(result.data?.map((s) => s.id)).toEqual(['slot-borda']);
  });
});

describe('getAdminAvailability - janela do mes no fuso do professor (GAP-08)', () => {
  it('RED: A16 Kiritimati 2026-09 pede a cobertura UTC da janela civil', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAdminAvailability('2026-09', 'Pacific/Kiritimati');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/admin/availability?date=2026-08-31&until=2026-10-01');
  });

  it('RED: A17 Sao Paulo 2026-09 recorta os slots na janela civil', async () => {
    stubFetchJson({ data: SLOTS_BORDA_SP.map((slot) => ({ ...slot, session: null })), error: null });
    const result = await getAdminAvailability('2026-09', 'America/Sao_Paulo');
    expect(result.data?.map((s) => s.id)).toEqual(['s-inicio', 's-borda']);
  });

  it('REGRESSAO: A18 sem fuso mantem o pedido de antes', async () => {
    const fetchMock = stubFetchJson({ data: [], error: null });
    await getAdminAvailability('2026-09');
    expect(caminhoPedido(fetchMock)).toBe('/api/v1/admin/availability?date=2026-09-01&until=2026-10-01');
  });
});
