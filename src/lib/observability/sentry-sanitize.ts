/**
 * Sanitizacao de eventos Sentry (GAP-12).
 *
 * `withSentrySanitizers` e aplicado nos tres runtimes (`sentry.server.config.ts`,
 * `sentry.client.config.ts`, `sentry.edge.config.ts`) e compoe `beforeSend`,
 * `beforeSendTransaction`, `beforeBreadcrumb` e `beforeSendSpan`. O percurso
 * troca por `[Filtered]`:
 * (a) o valor de chaves sensiveis de objeto (tokens, segredos, autorizacao,
 *     senhas, cookies), em qualquer profundidade;
 * (b) params sensiveis de URL, query e form (`token`, `code`, `state`,
 *     `refresh_token`, `access_token`, `id_token`, `client_secret`);
 * (c) em strings livres, `nome=valor` desses params, chaves JSON sensiveis,
 *     `Bearer <valor>` e valores com cara de segredo conhecido (`sk-...`,
 *     `ya29....`, `whsec_...`, JWT).
 *
 * Isomorfico: roda no Node, no Edge e no browser, sem dependencia de runtime
 * do SDK. Os tipos sao estruturais e locais. O evento nunca e mutado no lugar:
 * cada funcao devolve uma copia sanitizada.
 */

type SentryRecord = Record<string, unknown>;
type MaybePromise<T> = T | PromiseLike<T>;
type KeyPredicate = (key: string) => boolean;

const FILTERED = '[Filtered]';
const CIRCULAR = '[Circular]';

/** Profundidade maxima percorrida; a raiz fica na profundidade 0. */
const MAX_DEPTH = 8;
const SDK_PROCESSING_METADATA = 'sdkProcessingMetadata';

/** Params de URL, query e form. `code` so e filtrado aqui, nunca como chave de objeto. */
const URL_PARAM_NAMES = new Set([
  'token',
  'code',
  'state',
  'refresh_token',
  'access_token',
  'id_token',
  'client_secret',
]);

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-goog-channel-token',
]);

/** Chaves de objeto por nome normalizado (minusculas, sem `_` e `-`). */
const SENSITIVE_KEYS = new Set([
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'clientsecret',
  'refreshtokenenc',
  'channeltoken',
  'channeltokenenc',
  'token',
  'password',
  'authorization',
  'cookie',
]);

/** Variantes de nome de chave que tambem carregam segredo (api_key, encryptionKey, credential). */
const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|api[-_]?key|encryption[-_]?key|credential|private[-_]?key/i;

const SECRET_VALUE_PATTERN =
  /sk-[A-Za-z0-9_-]{16,}|ya29\.[A-Za-z0-9._-]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const BEARER_PATTERN = /\b(Bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi;

/** Par chave/valor JSON entre aspas, inclusive quando escapado dentro de outra string. */
const JSON_PAIR_PATTERN = /(\\*["'])([A-Za-z0-9_.-]{1,64})\1(\s*:\s*)\1((?:(?!\1)[\s\S])*)\1/g;

const URL_PARAM_PATTERN =
  /(^|[?&#\s])(token|code|state|refresh_token|access_token|id_token|client_secret)=[^&#\s"']*/gi;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key)) || SENSITIVE_KEY_PATTERN.test(key);
}

function isSensitiveParam(key: string): boolean {
  return URL_PARAM_NAMES.has(key.toLowerCase()) || isSensitiveKey(key);
}

function isSensitiveHeader(key: string): boolean {
  return SENSITIVE_HEADERS.has(key.toLowerCase()) || isSensitiveKey(key);
}

function isRecord(value: unknown): value is SentryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThenable<T>(value: MaybePromise<T>): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

/** Valor sob chave sensivel: `null`, `undefined` e booleanos nao carregam segredo. */
function filterValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }
  return FILTERED;
}

function scrubString(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, FILTERED)
    .replace(BEARER_PATTERN, `$1 ${FILTERED}`)
    .replace(JSON_PAIR_PATTERN, (match: string, quote: string, key: string, separator: string) =>
      isSensitiveKey(key) ? `${quote}${key}${quote}${separator}${quote}${FILTERED}${quote}` : match,
    )
    .replace(URL_PARAM_PATTERN, `$1$2=${FILTERED}`);
}

/**
 * Percurso recursivo. `ancestors` guarda so a cadeia atual (entra e sai), entao
 * a mesma referencia em dois ramos irmaos e copiada nos dois e so a volta a um
 * ancestral vira `[Circular]`. `isSensitive` vale para as chaves deste nivel;
 * os niveis de baixo usam o criterio de chave de objeto.
 */
function walk(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
  isSensitive: KeyPredicate = isSensitiveKey,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > MAX_DEPTH) {
    return FILTERED;
  }
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (ancestors.has(value)) {
    return CIRCULAR;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1, ancestors));
    }
    const out: SentryRecord = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = isSensitive(key) ? filterValue(item) : walk(item, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** `query_string` e `data`: string de form, lista de pares `[nome, valor]` ou objeto. */
function walkParams(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (!Array.isArray(value) || depth > MAX_DEPTH || ancestors.has(value)) {
    return walk(value, depth, ancestors, isSensitiveParam);
  }
  ancestors.add(value);
  try {
    return value.map((pair: unknown) => {
      if (Array.isArray(pair) && typeof pair[0] === 'string' && isSensitiveParam(pair[0])) {
        return [walk(pair[0], depth + 2, ancestors), ...pair.slice(1).map(filterValue)];
      }
      return walk(pair, depth + 1, ancestors);
    });
  } finally {
    ancestors.delete(value);
  }
}

function walkRequest(request: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (!isRecord(request) || depth > MAX_DEPTH || ancestors.has(request)) {
    return walk(request, depth, ancestors);
  }
  ancestors.add(request);
  try {
    const out: SentryRecord = {};
    for (const [key, item] of Object.entries(request)) {
      if (key === 'cookies') {
        out[key] = filterValue(item);
      } else if (key === 'headers') {
        out[key] = walk(item, depth + 1, ancestors, isSensitiveHeader);
      } else if (key === 'query_string' || key === 'data') {
        out[key] = walkParams(item, depth + 1, ancestors);
      } else {
        out[key] = isSensitiveKey(key) ? filterValue(item) : walk(item, depth + 1, ancestors);
      }
    }
    return out;
  } finally {
    ancestors.delete(request);
  }
}

/**
 * Sanitiza um evento (erro ou transacao): `request` (url, query_string, headers,
 * cookies inteiros, data), `breadcrumbs`, `extra`, `contexts`, `tags`, `message`,
 * `exception.values[].value`, `transaction`, `spans` e qualquer outro campo.
 * `sdkProcessingMetadata` passa por referencia: e estado interno do SDK (escopos
 * e contexto de amostragem), removido antes da serializacao do envelope.
 */
export function sanitizeSentryEvent<TEvent extends object>(event: TEvent): TEvent {
  if (!isRecord(event)) {
    return walk(event, 0, new WeakSet()) as TEvent;
  }
  const ancestors = new WeakSet<object>([event]);
  const out: SentryRecord = {};
  for (const [key, item] of Object.entries(event)) {
    if (key === SDK_PROCESSING_METADATA) {
      out[key] = item;
    } else if (key === 'request') {
      out[key] = walkRequest(item, 1, ancestors);
    } else {
      out[key] = isSensitiveKey(key) ? filterValue(item) : walk(item, 1, ancestors);
    }
  }
  return out as TEvent;
}

/** Sanitiza um breadcrumb avulso: `message` e `data`, inclusive `data.url`. */
export function sanitizeSentryBreadcrumb<TBreadcrumb extends object>(
  breadcrumb: TBreadcrumb,
): TBreadcrumb {
  return walk(breadcrumb, 0, new WeakSet()) as TBreadcrumb;
}

/**
 * Sanitiza um span: `description` e `data` (`url.full`, `url.query`, `http.url`,
 * `http.query` e demais chaves). Nunca devolve `null`.
 */
export function sanitizeSentrySpan<TSpan extends object>(span: TSpan): TSpan {
  const out = walk(span, 0, new WeakSet());
  return (isRecord(out) ? out : {}) as TSpan;
}

/** Callbacks que o chamador pode ja ter nas opcoes do `Sentry.init`. */
export interface SentrySanitizableOptions {
  beforeSend?(event: object, hint?: unknown): MaybePromise<object | null>;
  beforeSendTransaction?(event: object, hint?: unknown): MaybePromise<object | null>;
  beforeBreadcrumb?(breadcrumb: object, hint?: unknown): object | null;
  beforeSendSpan?(span: object): object | null;
}

/** Callbacks compostos devolvidos por `withSentrySanitizers`. */
export interface SentrySanitizerHooks {
  beforeSend<TEvent extends object>(event: TEvent, hint?: unknown): MaybePromise<TEvent | null>;
  beforeSendTransaction<TEvent extends object>(
    event: TEvent,
    hint?: unknown,
  ): MaybePromise<TEvent | null>;
  beforeBreadcrumb<TBreadcrumb extends object>(
    breadcrumb: TBreadcrumb,
    hint?: unknown,
  ): TBreadcrumb | null;
  beforeSendSpan<TSpan extends object>(span: TSpan): TSpan;
}

export type SentryOptionsWithSanitizers<TOptions> = Omit<TOptions, keyof SentrySanitizerHooks> &
  SentrySanitizerHooks;

/** Sanitiza o resultado do callback existente; `null` segue `null` e promessa e aguardada antes. */
function finishEvent<TEvent extends object>(
  result: MaybePromise<object | null>,
): MaybePromise<TEvent | null> {
  if (isThenable(result)) {
    return Promise.resolve(result).then((resolved) =>
      resolved === null ? null : (sanitizeSentryEvent(resolved) as TEvent),
    );
  }
  return result === null ? null : (sanitizeSentryEvent(result) as TEvent);
}

/**
 * Devolve uma copia de `options` com `beforeSend`, `beforeSendTransaction`,
 * `beforeBreadcrumb` e `beforeSendSpan` compostos: o callback existente roda
 * antes e o sanitizador por ultimo; `null` do existente continua `null`;
 * retorno assincrono do existente e aguardado antes de sanitizar. Os demais
 * campos, `dsn` inclusive, ficam identicos.
 */
export function withSentrySanitizers<TOptions extends object>(
  options: TOptions & SentrySanitizableOptions,
): SentryOptionsWithSanitizers<TOptions> {
  const existingSend = options.beforeSend;
  const existingTransaction = options.beforeSendTransaction;
  const existingBreadcrumb = options.beforeBreadcrumb;
  const existingSpan = options.beforeSendSpan;

  const hooks: SentrySanitizerHooks = {
    beforeSend(event, hint) {
      return finishEvent(existingSend ? existingSend(event, hint) : event);
    },
    beforeSendTransaction(event, hint) {
      return finishEvent(existingTransaction ? existingTransaction(event, hint) : event);
    },
    beforeBreadcrumb(breadcrumb, hint) {
      const result = existingBreadcrumb ? existingBreadcrumb(breadcrumb, hint) : breadcrumb;
      return result === null ? null : (sanitizeSentryBreadcrumb(result) as typeof breadcrumb);
    },
    beforeSendSpan(span) {
      const result = existingSpan ? existingSpan(span) : span;
      return sanitizeSentrySpan(result === null ? span : result) as typeof span;
    },
  };

  return { ...options, ...hooks };
}
