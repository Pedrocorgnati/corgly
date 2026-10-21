import 'server-only';
import { timeoutSignal } from '@/lib/timeout-signal';

/**
 * Remetente Resend dedicado aos emails de ebook (item 006, D-C1/D-C2).
 *
 * Nao reusa `sendAndLog`/`createResendProvider` de `email-delivery.service.ts`:
 *  - `sendAndLog` grava o HTML renderizado no banco, e o link de acesso carrega
 *    o token cru (o token so pode existir como hash fora do email);
 *  - `createResendProvider` nao envia `Idempotency-Key` nem `text` e cai em
 *    modo noop sem chave, o que marcaria uma entrega que nunca aconteceu.
 *
 * Sem chave o remetente LANCA erro transiente antes de qualquer fetch: nunca
 * existe modo noop aqui. Erros carregam so status HTTP e `name` do Resend;
 * destinatario, corpo, link e chave nunca entram em mensagem de erro.
 */

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

/** Mesmo prazo de `RESEND_TIMEOUT_MS` de `email-delivery.service.ts`. */
export const EBOOK_EMAIL_DEFAULT_TIMEOUT_MS = 10_000;

/** Estado normalizado do `last_event` do Resend. */
export type EbookEmailState =
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'failed'
  | 'bounced'
  | 'suppressed'
  | 'complained'
  | 'pending';

const KNOWN_EMAIL_STATES: ReadonlySet<string> = new Set<EbookEmailState>([
  'delivered',
  'opened',
  'clicked',
  'failed',
  'bounced',
  'suppressed',
  'complained',
]);

export interface EbookEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface EbookEmailSender {
  send(message: EbookEmailMessage): Promise<{ id: string }>;
  getState(emailId: string): Promise<EbookEmailState>;
}

export interface CreateEbookEmailSenderOptions {
  apiKey: string | undefined;
  from: string;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

/**
 * Falha do Resend. `transient` diz se a mesma requisicao pode ser repetida
 * (rede, timeout, 408, 429, 5xx, 409 concorrente, 2xx sem id); `status` e o
 * HTTP recebido ou `null` quando nao houve resposta.
 */
export class EbookEmailSendError extends Error {
  readonly transient: boolean;
  readonly status: number | null;

  constructor(message: string, options: { transient: boolean; status: number | null }) {
    super(message);
    this.name = 'EbookEmailSendError';
    this.transient = options.transient;
    this.status = options.status;
  }
}

/** Le o `name` do corpo de erro do Resend sem propagar o resto do payload. */
async function readResendErrorName(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'name' in body) {
      const name = (body as { name?: unknown }).name;
      if (typeof name === 'string' && /^[a-z0-9_]{1,80}$/i.test(name)) return name;
    }
  } catch {
    // corpo ausente ou nao-JSON: classifica so pelo status
  }
  return null;
}

/** Tabela de classificacao de D-C1: o que nao e transiente e permanente. */
function isTransientStatus(status: number, resendName: string | null): boolean {
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status === 409) return resendName === 'concurrent_idempotent_requests';
  return false;
}

async function toSendError(response: Response, operation: 'send' | 'getState'): Promise<EbookEmailSendError> {
  const resendName = await readResendErrorName(response);
  const transient = isTransientStatus(response.status, resendName);
  return new EbookEmailSendError(
    `Resend ${operation} falhou: status ${response.status}${resendName ? ` (${resendName})` : ''}`,
    { transient, status: response.status },
  );
}

function networkError(operation: 'send' | 'getState', err: unknown): EbookEmailSendError {
  const kind = err instanceof Error && err.name ? err.name : 'erro de rede';
  return new EbookEmailSendError(`Resend ${operation} sem resposta: ${kind}`, {
    transient: true,
    status: null,
  });
}

export function createEbookEmailSender(options: CreateEbookEmailSenderOptions): EbookEmailSender {
  const timeoutMs = options.timeoutMs ?? EBOOK_EMAIL_DEFAULT_TIMEOUT_MS;

  function requireApiKey(operation: 'send' | 'getState'): string {
    const apiKey = options.apiKey?.trim() ?? '';
    if (!apiKey) {
      throw new EbookEmailSendError(`Resend ${operation} indisponivel: RESEND_API_KEY ausente`, {
        transient: true,
        status: null,
      });
    }
    return apiKey;
  }

  // fetch resolvido na hora da chamada (testes trocam o global depois do import)
  function resolveFetch(): typeof fetch {
    return options.fetchImpl ?? fetch;
  }

  return {
    async send(message) {
      const apiKey = requireApiKey('send');
      let response: Response;
      try {
        response = await resolveFetch()(RESEND_EMAILS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({
            from: options.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: timeoutSignal(timeoutMs),
        });
      } catch (err) {
        throw networkError('send', err);
      }

      if (!response.ok) throw await toSendError(response, 'send');

      let id: unknown = null;
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'id' in body) id = (body as { id?: unknown }).id;
      } catch {
        id = null;
      }
      if (typeof id !== 'string' || id.trim() === '') {
        throw new EbookEmailSendError('Resend send respondeu 2xx sem id', {
          transient: true,
          status: response.status,
        });
      }
      return { id };
    },

    async getState(emailId) {
      const apiKey = requireApiKey('getState');
      let response: Response;
      try {
        response = await resolveFetch()(`${RESEND_EMAILS_ENDPOINT}/${encodeURIComponent(emailId)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: timeoutSignal(timeoutMs),
        });
      } catch (err) {
        throw networkError('getState', err);
      }

      if (!response.ok) throw await toSendError(response, 'getState');

      let lastEvent: unknown = null;
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'last_event' in body) {
          lastEvent = (body as { last_event?: unknown }).last_event;
        }
      } catch {
        lastEvent = null;
      }
      if (typeof lastEvent === 'string' && KNOWN_EMAIL_STATES.has(lastEvent)) {
        return lastEvent as EbookEmailState;
      }
      return 'pending';
    },
  };
}
