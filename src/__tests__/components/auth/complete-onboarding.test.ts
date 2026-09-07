// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  cookies: vi.fn(),
  internalApiOrigin: vi.fn(),
  completeOnboardingService: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/internal-api', () => ({
  internalApiOrigin: mocks.internalApiOrigin,
}));

vi.mock('@/services/auth.service', () => ({
  authService: { completeOnboarding: mocks.completeOnboardingService },
}));

import { completeOnboarding } from '@/actions/onboarding.actions';
import { POST } from '@/app/api/v1/auth/onboarding/route';

const COOKIE_HEADER = 'corgly_token=jwt-de-teste';

function sessionFor(userId: string) {
  return {
    user: {
      id: userId,
      role: 'STUDENT',
      isFirstPurchase: true,
      onboardingCompletedAt: null,
      emailConfirmed: true,
      tokenVersion: 0,
    },
  };
}

/**
 * `completeOnboarding` e o outro ponto que decide se o aluno entra no produto:
 * enquanto `onboardingCompletedAt` nao grava, todo login devolve o aluno ao
 * onboarding. Cobrimos os DOIS elos da cadeia — a Server Action e a rota que ela
 * chama — porque cada um ja quebrou sozinho (a action chegou a fazer PATCH numa
 * rota inexistente e falhava 404 em silencio para o usuario).
 */
describe('completeOnboarding (Server Action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ toString: () => COOKIE_HEADER });
    mocks.internalApiOrigin.mockResolvedValue('http://127.0.0.1:3110');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sem sessao ativa: lanca e NAO chama a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(null);

    await expect(completeOnboarding('user-1')).rejects.toThrow('Unauthorized: no active session');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('userId diferente do da sessao: lanca e NAO chama a API (anti-IDOR)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(sessionFor('user-1'));

    await expect(completeOnboarding('user-2')).rejects.toThrow('Unauthorized: user ID mismatch');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caminho feliz: faz POST na rota real, com o cookie de sessao encaminhado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(sessionFor('user-1'));

    await expect(completeOnboarding('user-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:3110/api/v1/auth/onboarding');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>).Cookie).toBe(COOKIE_HEADER);
  });

  it('falha de rede: converte em mensagem acionavel para o usuario', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    mocks.getSession.mockResolvedValue(sessionFor('user-1'));

    await expect(completeOnboarding('user-1')).rejects.toThrow(
      'Falha ao completar onboarding. Tente novamente.',
    );
  });

  it('resposta nao-ok: lanca a mesma mensagem acionavel (nunca resolve em silencio)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ data: null, error: 'Erro interno.', message: null }),
      }),
    );
    mocks.getSession.mockResolvedValue(sessionFor('user-1'));

    await expect(completeOnboarding('user-1')).rejects.toThrow(
      'Falha ao completar onboarding. Tente novamente.',
    );
  });
});

describe('POST /api/v1/auth/onboarding', () => {
  function request(headers: Record<string, string>, body: unknown = {}) {
    return new NextRequest('http://localhost/api/v1/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sem x-user-id devolve 401 e nao toca no servico', async () => {
    const res = await POST(request({}));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      data: null,
      error: 'Não autorizado.',
      message: null,
    });
    expect(mocks.completeOnboardingService).not.toHaveBeenCalled();
  });

  it('com x-user-id conclui o onboarding do usuario do token', async () => {
    mocks.completeOnboardingService.mockResolvedValue(undefined);

    const res = await POST(request({ 'x-user-id': 'user-1' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: null,
      error: null,
      message: 'Onboarding concluído.',
    });
    expect(mocks.completeOnboardingService).toHaveBeenCalledWith('user-1');
  });

  it('ignora userId vindo do corpo: so o header confiavel decide (anti-IDOR)', async () => {
    mocks.completeOnboardingService.mockResolvedValue(undefined);

    const res = await POST(request({ 'x-user-id': 'user-1' }, { userId: 'user-2' }));

    expect(res.status).toBe(200);
    expect(mocks.completeOnboardingService).toHaveBeenCalledWith('user-1');
    expect(mocks.completeOnboardingService).not.toHaveBeenCalledWith('user-2');
  });

  it('servico lancando devolve 500 no envelope, sem vazar a excecao', async () => {
    mocks.completeOnboardingService.mockRejectedValue(new Error('db down'));

    const res = await POST(request({ 'x-user-id': 'user-1' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      data: null,
      error: 'Erro interno.',
      message: null,
    });
  });
});
