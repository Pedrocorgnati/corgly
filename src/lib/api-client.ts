/**
 * @module lib/api-client
 * Wrapper fetch centralizado — Module 2: Shared Foundations
 *
 * CONTRATO: Usar apiClient em vez de fetch() diretamente nos componentes.
 * Suporta cookies httpOnly (credentials: 'include') e tipagem genérica.
 *
 * COPY DE ERRO: toda mensagem que este módulo inventa (401 mudo, 429, abort,
 * falha de rede) sai do catálogo `@/lib/errors/copy` no locale ativo. Antes
 * havia string fixa aqui — uma delas em inglês ("Request aborted"), as outras
 * em pt-BR —, o que entregava o idioma errado para 3 dos 4 públicos do app.
 * A mensagem autoral do servidor continua vencendo o catálogo quando existe.
 */

import { activeLocale, getErrorCopy } from '@/lib/errors/copy';

const API_TIMEOUT_MS = 30_000;

/**
 * Descrição traduzida de um error code, para quando não há texto do servidor.
 *
 * O locale ativo vem de `@/lib/errors/copy`, dono da copy de erro. Este módulo
 * mantinha uma cópia privada da mesma heurística (`<html lang>` → locale
 * suportado → `defaultLocale`): duas implementações da mesma regra divergem no
 * dia em que uma delas muda, e a que ficar para trás volta a entregar idioma
 * errado — que é exatamente o defeito que o catálogo existe para eliminar.
 */
function localizedMessage(code: string): string {
  return getErrorCopy(code, activeLocale()).description;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiClientOptions = RequestInit & {
  /** Query string params — serialized as ?key=value&... */
  params?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
  /**
   * Suprime o evento global `auth:expired` num 401.
   * Usar em chamadas de SONDAGEM de sessao (ex.: GET /auth/me no mount do
   * AuthProvider), onde 401 significa "visitante anonimo" e nao "sessao
   * expirou". Sem isso, toda pagina publica derruba o visitante no login.
   */
  skipAuthRedirect?: boolean;
};

function buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
  if (!params || Object.keys(params).length === 0) return url;
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  return `${url}?${qs.toString()}`;
}

async function request<T>(
  url: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { params, signal, skipAuthRedirect, ...init } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // Merge signals
  const mergedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(buildUrl(url, params), {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: mergedSignal,
    });

    clearTimeout(timeoutId);

    // Emitir evento global para useAuth redirecionar em 401
    if (response.status === 401) {
      if (typeof window !== 'undefined' && !skipAuthRedirect) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      const body = await response.json().catch(() => ({}));
      // 401 tem dois motivos distintos: credencial errada agora (AUTH_001) e
      // sessao que morreu (AUTH_002). Carimbar AUTH_001 em todo 401 apagava a
      // diferenca e deixava o consumidor sem como ramificar — por isso o `code`
      // do servidor vence, e AUTH_001 fica so como default de rota que nao
      // declara nenhum.
      const authCode: string =
        typeof (body as { code?: unknown })?.code === 'string'
          ? (body as { code: string }).code
          : 'AUTH_001';
      throw new ApiError(body?.error ?? localizedMessage(authCode), 401, authCode);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const isRateLimited = response.status === 429;
      const code: string | undefined = isRateLimited ? 'RATE_LIMITED' : body?.code;
      // 429 é a única resposta cujo corpo pode não ser nosso: o proxy responde
      // "Too many requests" em inglês. Nesse caso a copy curada vence o corpo.
      // Nos demais, a mensagem do servidor é a mais específica; sem ela, o
      // catálogo traduz o code (e code ausente cai em INTERNAL_ERROR).
      const message: string = isRateLimited
        ? localizedMessage('RATE_LIMITED')
        : (body?.error ?? localizedMessage(code ?? 'INTERNAL_ERROR'));
      throw new ApiError(message, response.status, code, body?.details);
    }

    // 204 No Content
    if (response.status === 204) return undefined as unknown as T;

    return response.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(localizedMessage('ABORTED'), 0, 'ABORTED');
    }
    throw new ApiError(localizedMessage('NETWORK_ERROR'), 0, 'NETWORK_ERROR');
  }
}

export const apiClient = {
  get<T>(url: string, options?: ApiClientOptions): Promise<T> {
    return request<T>(url, { ...options, method: 'GET' });
  },

  post<T>(url: string, body: unknown, options?: ApiClientOptions): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch<T>(url: string, body: unknown, options?: ApiClientOptions): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  put<T>(url: string, body: unknown, options?: ApiClientOptions): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  delete<T>(url: string, options?: ApiClientOptions): Promise<T> {
    return request<T>(url, { ...options, method: 'DELETE' });
  },
};
