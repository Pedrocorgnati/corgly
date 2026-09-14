/**
 * GAP-07 (item 018) - leitura do fuso canonico no editor de disponibilidade.
 *
 * Ate o PRED o `useEffect` do `AvailabilityEditor` terminava em
 * `.catch(() => {})`: a leitura de app_settings falhava sem sinal nenhum e o
 * form seguia com um fuso fixo. O que estes testes travam:
 *
 *  1. falha HTTP vira alerta com retry e toast do catalogo, sem vazar o corpo
 *     do servidor (o `ApiError.message` vem de `body.error`, api-client.ts);
 *  2. o retry re-le o fuso, o alerta some e o POST leva o fuso lido;
 *  3. falha de rede usa a copy propria;
 *  4. leitura ok nao mostra alerta (controle positivo: o POST prova que a
 *     leitura foi aplicada, entao a ausencia do alerta nao e vacua);
 *  5. resposta que chega depois do unmount e descartada (review Codex F2);
 *  6. retry em andamento expoe `aria-busy` no botao (review Codex F5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@/test/utils';
import { server } from '@/test/mocks/server';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import ptBR from '../../../../i18n/messages/pt-BR.json';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';

type CopyFuso = Partial<
  Record<'alertFailOpen' | 'alertFailClosed' | 'retry' | 'toastGeneric' | 'toastNetwork', string>
>;

// No PRED o bloco ainda nao existe no catalogo: leitura defensiva para o
// arquivo carregar e o caso falhar no assert, nao no import.
const COPY: CopyFuso =
  (ptBR as unknown as { calendar?: { availabilityEditor?: { timezoneLoad?: CopyFuso } } }).calendar
    ?.availabilityEditor?.timezoneLoad ?? {};

const MARCADOR = 'detalhe-interno-sintetico-gap07';
const URL_SETTINGS = '*/api/v1/admin/settings';
const URL_GERAR = '*/api/v1/availability';

let corposPost: unknown[] = [];

function responder500() {
  return HttpResponse.json(
    { data: null, error: MARCADOR, code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

function responderFuso(timezone: string) {
  return HttpResponse.json({ data: { timezone } });
}

/**
 * Adaptacao de harness: no jsdom o `AbortController` global e o do jsdom, e o
 * `fetch` do Node recusa esse signal ("RequestInit: Expected signal ... to be
 * an instance of AbortSignal"). Sem isto, todo `apiClient.get/post` virava
 * NETWORK_ERROR antes de chegar ao MSW. O duble repassa a chamada ao fetch ja
 * interceptado pelo MSW (capturado aqui, depois do `server.listen` do setup),
 * sem o signal; o timeout do api-client nao entra em nenhum caso deste arquivo.
 */
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
      corposPost.push(await request.json());
      return HttpResponse.json({ data: { created: 1, skipped: 0 }, error: null }, { status: 201 });
    }),
  );
});

describe('AvailabilityEditor - leitura do fuso canonico (GAP-07)', () => {
  it('RED 018 [ST008]: GET 500 mostra alerta com retry e toast do catalogo', async () => {
    server.use(http.get(URL_SETTINGS, () => responder500()));

    const { user } = render(<AvailabilityEditor />);

    expect(await screen.findByTestId('form-generate-slots-timezone-load-error')).toBeInTheDocument();
    expect(screen.getByTestId('form-generate-slots-timezone-load-error-retry-button')).toBeInTheDocument();
    expect(COPY.toastGeneric).toEqual(expect.any(String));
    expect(toast.error).toHaveBeenCalledWith(COPY.toastGeneric);

    // Gera o POST para provar que o marcador tambem nao vai no corpo.
    await user.click(screen.getByTestId('form-generate-slots-day-2-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));
    await waitFor(() => expect(corposPost).toHaveLength(1));

    expect(document.body.innerHTML).not.toContain(MARCADOR);
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain(MARCADOR);
    expect(JSON.stringify(corposPost)).not.toContain(MARCADOR);
  });

  it('RED 018 [ST008]: retry com sucesso some o alerta e o POST leva o fuso lido', async () => {
    let leituras = 0;
    server.use(
      http.get(URL_SETTINGS, () => {
        leituras += 1;
        return leituras === 1 ? responder500() : responderFuso('Europe/Rome');
      }),
    );

    const { user } = render(<AvailabilityEditor />);

    await user.click(
      await screen.findByTestId('form-generate-slots-timezone-load-error-retry-button'),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('form-generate-slots-timezone-load-error')).not.toBeInTheDocument(),
    );
    expect(leituras).toBe(2);

    await user.click(screen.getByTestId('form-generate-slots-day-2-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));
    await waitFor(() => expect(corposPost).toHaveLength(1));
    expect(corposPost[0]).toMatchObject({ timezone: 'Europe/Rome' });
  });

  it('RED 018 [ST008]: falha de rede usa toastNetwork', async () => {
    server.use(http.get(URL_SETTINGS, () => HttpResponse.error()));

    render(<AvailabilityEditor />);

    expect(await screen.findByTestId('form-generate-slots-timezone-load-error')).toBeInTheDocument();
    expect(COPY.toastNetwork).toEqual(expect.any(String));
    expect(toast.error).toHaveBeenCalledWith(COPY.toastNetwork);
    expect(toast.error).not.toHaveBeenCalledWith(COPY.toastGeneric);
  });

  it('CONTROLE: GET com sucesso nao mostra alerta', async () => {
    let leituras = 0;
    server.use(
      http.get(URL_SETTINGS, () => {
        leituras += 1;
        return responderFuso('Europe/Rome');
      }),
    );

    const { user } = render(<AvailabilityEditor />);
    await waitFor(() => expect(leituras).toBe(1));

    await user.click(screen.getByTestId('form-generate-slots-day-2-button'));
    await user.click(screen.getByTestId('form-generate-slots-submit-button'));
    await waitFor(() => expect(corposPost).toHaveLength(1));

    expect(corposPost[0]).toMatchObject({ timezone: 'Europe/Rome' });
    expect(screen.queryByTestId('form-generate-slots-timezone-load-error')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('CONTROLE: falha que chega depois do unmount nao gera toast', async () => {
    let liberar: () => void = () => {};
    const resposta = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let leituras = 0;
    server.use(
      http.get(URL_SETTINGS, async () => {
        leituras += 1;
        await resposta;
        return responder500();
      }),
    );
    const leitura = vi.spyOn(apiClient, 'get');

    try {
      const { unmount } = render(<AvailabilityEditor />);
      await waitFor(() => expect(leituras).toBe(1));
      unmount();
      liberar();

      // A leitura termina mesmo em ApiError: sem o descarte no cleanup do
      // efeito, o catch do editor chamaria toast.error como no primeiro caso.
      await expect(leitura.mock.results[0]?.value).rejects.toBeInstanceOf(ApiError);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      leitura.mockRestore();
    }
  });

  it('CONTROLE: retry em andamento marca o botao como ocupado', async () => {
    let liberar: () => void = () => {};
    const segunda = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let leituras = 0;
    server.use(
      http.get(URL_SETTINGS, async () => {
        leituras += 1;
        if (leituras === 1) return responder500();
        await segunda;
        return responderFuso('Europe/Rome');
      }),
    );

    const { user } = render(<AvailabilityEditor />);
    const retry = await screen.findByTestId('form-generate-slots-timezone-load-error-retry-button');
    expect(retry).toHaveAttribute('aria-busy', 'false');

    await user.click(retry);
    await waitFor(() => expect(leituras).toBe(2));
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toBeDisabled();

    liberar();
    await waitFor(() =>
      expect(screen.queryByTestId('form-generate-slots-timezone-load-error')).not.toBeInTheDocument(),
    );
  });
});
