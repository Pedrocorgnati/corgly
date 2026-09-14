/**
 * GAP-07 (item 018, ST005) - politica do editor quando a leitura do fuso falha.
 *
 * Gate ST004 = opcao 1 (fail-open): com a leitura de app_settings falhando, o
 * editor avisa que o servidor define o fuso e continua gerando, sem mandar a
 * chave `timezone` no POST (o servidor resolve com `getCanonicalTimezone`).
 * O controle prova que, com a leitura ok, o botao de gerar segue habilitado.
 *
 * Harness igual ao de `availability-editor-timezone-load.test.tsx` (teste 5 do
 * ST001), inclusive o repasse do fetch sem signal explicado la.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@/test/utils';
import { server } from '@/test/mocks/server';
import ptBR from '../../../../i18n/messages/pt-BR.json';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';

type CopyFuso = Partial<Record<'alertFailOpen' | 'alertFailClosed' | 'retry', string>>;

// No PRED o bloco ainda nao existe no catalogo: leitura defensiva para o
// arquivo carregar e o caso falhar no assert, nao no import.
const COPY: CopyFuso =
  (ptBR as unknown as { calendar?: { availabilityEditor?: { timezoneLoad?: CopyFuso } } }).calendar
    ?.availabilityEditor?.timezoneLoad ?? {};

const MARCADOR = 'detalhe-interno-sintetico-gap07';
const URL_SETTINGS = '*/api/v1/admin/settings';
const URL_GERAR = '*/api/v1/availability';

let corposPost: Record<string, unknown>[] = [];

// Adaptacao de harness: ver o comentario de mesmo nome no teste de leitura.
beforeEach(() => {
  const fetchInterceptado = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    fetchInterceptado(input, { ...init, signal: null }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  corposPost = [];
  server.use(
    http.post(URL_GERAR, async ({ request }) => {
      corposPost.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ data: { created: 1, skipped: 0 }, error: null }, { status: 201 });
    }),
  );
});

describe('AvailabilityEditor - politica de falha da leitura do fuso (GAP-07 ST004=1)', () => {
  it('RED 018 [ST008]: fail-open mostra alertFailOpen e gera sem timezone', async () => {
    server.use(
      http.get(URL_SETTINGS, () =>
        HttpResponse.json({ data: null, error: MARCADOR, code: 'INTERNAL_ERROR' }, { status: 500 }),
      ),
    );

    const { user } = render(<AvailabilityEditor />);

    const alerta = await screen.findByTestId('form-generate-slots-timezone-load-error');
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(COPY.alertFailOpen).toEqual(expect.any(String));
    expect(alerta).toHaveTextContent(COPY.alertFailOpen as string);

    const gerar = screen.getByTestId('form-generate-slots-submit-button');
    expect(gerar).toBeEnabled();

    await user.click(screen.getByTestId('form-generate-slots-day-2-button'));
    await user.click(gerar);
    await waitFor(() => expect(corposPost).toHaveLength(1));

    expect(corposPost[0]).not.toHaveProperty('timezone');
    expect(JSON.stringify(corposPost)).not.toContain(MARCADOR);
    expect(document.body.innerHTML).not.toContain(MARCADOR);
  });

  it('CONTROLE: com leitura ok o botao fica habilitado', async () => {
    let leituras = 0;
    server.use(
      http.get(URL_SETTINGS, () => {
        leituras += 1;
        return HttpResponse.json({ data: { timezone: 'Europe/Rome' } });
      }),
    );

    render(<AvailabilityEditor />);
    await waitFor(() => expect(leituras).toBe(1));

    expect(screen.getByTestId('form-generate-slots-submit-button')).toBeEnabled();
    expect(screen.queryByTestId('form-generate-slots-timezone-load-error')).not.toBeInTheDocument();
  });
});
