/**
 * @module lib/api-client
 * Wrapper fetch centralizado — Module 2: Shared Foundations
 *
 * CONTRATO: Usar apiClient em vez de fetch() diretamente nos componentes.
 * Suporta cookies httpOnly (credentials: 'include') e tipagem genérica.
 */

const API_TIMEOUT_MS = 30_000;

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
  const { params, signal, ...init } = options;

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body?.error ?? 'Não autorizado', 401, 'AUTH_001');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code = response.status === 429 ? 'RATE_LIMITED' : body?.code;
      throw new ApiError(body?.error ?? `HTTP ${response.status}`, response.status, code, body?.details);
    }

    // 204 No Content
    if (response.status === 204) return undefined as unknown as T;

    return response.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request aborted', 0, 'ABORTED');
    }
    throw new ApiError('Erro de rede. Verifique sua conexão.', 0, 'NETWORK_ERROR');
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
