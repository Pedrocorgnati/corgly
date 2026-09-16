/**
 * Sanitizacao de eventos Sentry (GAP-12).
 *
 * `beforeSend` aplicado nos tres runtimes (`sentry.server.config.ts`,
 * `sentry.client.config.ts`, `sentry.edge.config.ts`): varre o evento e
 * (a) substitui por `[Filtered]` o valor de qualquer chave sensivel
 *     (tokens, segredos, autorizacao, senhas), em qualquer profundidade;
 * (b) mascara em strings valores com cara de segredo conhecido
 *     (`sk-...`, `ya29....`, `whsec_...`, JWT) sem depender do nome da chave.
 *
 * O evento nunca e mutado no lugar: a funcao devolve uma copia sanitizada.
 */

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|api[-_]?key|encryption[-_]?key|credential|private[-_]?key/i;

const SECRET_VALUE_PATTERN =
  /sk-[A-Za-z0-9_-]{16,}|ya29\.[A-Za-z0-9._-]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const FILTERED = '[Filtered]';

function scrubString(value: string): string {
  return value.replace(SECRET_VALUE_PATTERN, FILTERED);
}

function scrubValue(key: string | null, value: unknown): unknown {
  if (typeof value === 'string') {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return FILTERED;
    }
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(null, item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(k, v);
    }
    return out;
  }
  return value;
}

/**
 * Sanitiza um evento Sentry antes do envio. Tipada de forma estrutural para
 * nao depender de `@sentry/nextjs` instalado no ambiente de teste.
 */
export function sanitizeSentryEvent<TEvent extends Record<string, unknown>>(
  event: TEvent,
): TEvent {
  return scrubValue(null, event) as TEvent;
}
