/**
 * GAP-04 ST004 - `auth:expired` por status no api-client.
 *
 * O evento global `auth:expired` derruba a sessao no cliente (useAuth
 * redireciona para o login). Ele so pode nascer de 401: um 2xx ou um 403 de
 * `requireAdmin` que o disparasse tiraria o professor da tela no meio de uma
 * acao valida ou negada.
 *
 * Classe: regressao (api-client.ts:93-125 no HEAD PRED 0da0f00). Os dois
 * controles de 401 provam que o listener esta ligado, entao as assercoes de
 * ausencia nao passam por construcao.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError } from '@/lib/api-client';

const ACESSO_RESTRITO = 'Acesso restrito a administradores.';
const URL_SLOT = '/api/v1/availability/slot-1';

function resposta(status: number, corpo?: unknown): Response {
  // 204 nao admite corpo.
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// O stub ignora o `signal`: o AbortSignal do jsdom nao e aceito pelo fetch do Node.
const fetchStub = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const expirou = vi.fn();

const VERBOS = {
  get: () => apiClient.get(URL_SLOT),
  post: () => apiClient.post(URL_SLOT, {}),
  patch: () => apiClient.patch(URL_SLOT, {}),
  put: () => apiClient.put(URL_SLOT, {}),
  delete: () => apiClient.delete(URL_SLOT),
};

beforeEach(() => {
  fetchStub.mockReset();
  expirou.mockReset();
  vi.stubGlobal('fetch', fetchStub);
  window.addEventListener('auth:expired', expirou);
});

afterEach(() => {
  window.removeEventListener('auth:expired', expirou);
  vi.unstubAllGlobals();
});

describe('api-client: auth:expired por status (GAP-04)', () => {
  it.each([
    { verbo: 'get', status: 200, corpo: { data: { ok: true }, error: null } },
    { verbo: 'post', status: 201, corpo: { data: { created: 1 }, error: null } },
    { verbo: 'patch', status: 200, corpo: { data: null, error: null, message: 'Slot bloqueado.' } },
    { verbo: 'put', status: 200, corpo: { data: { ok: true }, error: null } },
    { verbo: 'delete', status: 204, corpo: undefined },
  ] as const)('$verbo com $status resolve e nao dispara auth:expired', async ({ verbo, status, corpo }) => {
    fetchStub.mockResolvedValueOnce(resposta(status, corpo));

    // 204 resolve `undefined`; os demais resolvem o corpo JSON.
    await expect(VERBOS[verbo]()).resolves.toEqual(corpo);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0][1]?.method).toBe(verbo.toUpperCase());
    expect(expirou).not.toHaveBeenCalled();
  });

  it.each(['post', 'patch', 'delete'] as const)(
    '%s com 403 rejeita com ApiError 403 e a mensagem do servidor, sem auth:expired',
    async (verbo) => {
      fetchStub.mockResolvedValueOnce(resposta(403, { data: null, error: ACESSO_RESTRITO }));

      const erro = await VERBOS[verbo]().catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(ApiError);
      expect(erro).toMatchObject({ status: 403, message: ACESSO_RESTRITO });
      expect(expirou).not.toHaveBeenCalled();
    },
  );

  it('controle positivo: 401 dispara auth:expired exatamente 1 vez e rejeita com ApiError 401', async () => {
    fetchStub.mockResolvedValueOnce(resposta(401, { data: null, error: 'Sessão invalidada. Faça login novamente.' }));

    const erro = await apiClient.patch(`${URL_SLOT}/block`, {}).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro).toMatchObject({ status: 401 });
    expect(expirou).toHaveBeenCalledTimes(1);
  });

  it('controle: 401 com skipAuthRedirect nao dispara auth:expired', async () => {
    fetchStub.mockResolvedValueOnce(resposta(401, { data: null, error: 'Não autorizado.' }));

    const erro = await apiClient.get('/api/v1/auth/me', { skipAuthRedirect: true }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro).toMatchObject({ status: 401 });
    expect(expirou).not.toHaveBeenCalled();
  });
});
