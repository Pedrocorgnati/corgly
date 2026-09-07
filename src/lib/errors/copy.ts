/**
 * @module lib/errors/copy
 * Mapa de error codes -> copy UX multilingue, nos quatro locales de
 * `i18n/config`. Existe para que uma falha SEM texto autoral do servidor chegue
 * ao usuario no idioma dele, em vez de uma string fixa em pt-BR ou em ingles
 * cravada no cliente.
 *
 * PRECEDENCIA (contrato com `src/lib/api-client.ts`, unico consumidor de
 * runtime hoje):
 *
 *  1. Mensagem autoral do servidor (`body.error`), quando existe. E a mais
 *     especifica — traz o motivo real ("Voce tem 2 lote(s) de creditos
 *     ativos"), coisa que copy generica por codigo nao consegue reproduzir.
 *  2. Este catalogo, para os codigos que o proprio `api-client` SINTETIZA
 *     (`AUTH_001` em 401 mudo, `RATE_LIMITED` em 429, `ABORTED`,
 *     `NETWORK_ERROR`) e para qualquer resposta que chegue sem `error`.
 *  3. `INTERNAL_ERROR`, tambem traduzido, para codigo nao mapeado.
 *
 * O passo 3 e o que torna seguro NAO enumerar aqui os ~100 codigos de dominio
 * do backend (`PAYMENT_0xx`, `SESSION_0xx`, `mfa_required`, ...): todos eles
 * viajam com mensagem autoral propria e vencem pelo passo 1; se um dia algum
 * chegar mudo, cai em copy traduzida — nunca em string vazia, nunca em pt-BR
 * fixo para um aluno que le em ingles.
 *
 * Uso:
 *   import { getErrorCopy } from '@/lib/errors/copy';
 *   const { title, description, action } = getErrorCopy('AUTH_001', locale);
 */

import { defaultLocale, locales, type Locale } from '../../../i18n/config';

export interface ErrorCopy {
  title: string;
  description: string;
  action?: string;
}

type LocaleMap = Record<Locale, ErrorCopy>;

const ERROR_COPY: Record<string, LocaleMap> = {
  // ---- Auth ----
  AUTH_001: {
    'pt-BR': {
      title: 'Credenciais invalidas',
      description: 'Email ou senha incorretos. Verifique e tente novamente.',
      action: 'Recuperar senha',
    },
    'en-US': {
      title: 'Invalid credentials',
      description: 'Email or password is incorrect. Please try again.',
      action: 'Reset password',
    },
    'es-ES': {
      title: 'Credenciales invalidas',
      description: 'Email o contrasena incorrectos. Intentalo de nuevo.',
      action: 'Recuperar contrasena',
    },
    'it-IT': {
      title: 'Credenziali non valide',
      description: 'Email o password errati. Riprova.',
      action: 'Recupera password',
    },
  },
  AUTH_002: {
    'pt-BR': { title: 'Sessao expirada', description: 'Sua sessao expirou. Faca login novamente.', action: 'Entrar' },
    'en-US': { title: 'Session expired', description: 'Your session has expired. Please sign in again.', action: 'Sign in' },
    'es-ES': { title: 'Sesion expirada', description: 'Tu sesion ha expirado. Inicia sesion otra vez.', action: 'Iniciar sesion' },
    'it-IT': { title: 'Sessione scaduta', description: 'La tua sessione e scaduta. Accedi di nuovo.', action: 'Accedi' },
  },
  AUTH_003: {
    'pt-BR': { title: 'Acesso negado', description: 'Voce nao tem permissao para esta acao.' },
    'en-US': { title: 'Access denied', description: 'You do not have permission to perform this action.' },
    'es-ES': { title: 'Acceso denegado', description: 'No tienes permiso para esta accion.' },
    'it-IT': { title: 'Accesso negato', description: 'Non hai il permesso per questa azione.' },
  },

  // ---- Validation ----
  VAL_001: {
    'pt-BR': { title: 'Dados invalidos', description: 'Verifique os campos destacados e tente novamente.' },
    'en-US': { title: 'Invalid data', description: 'Please check the highlighted fields and try again.' },
    'es-ES': { title: 'Datos invalidos', description: 'Revisa los campos resaltados e intentalo de nuevo.' },
    'it-IT': { title: 'Dati non validi', description: 'Controlla i campi evidenziati e riprova.' },
  },

  // ---- Credits / Billing ----
  CREDIT_001: {
    'pt-BR': { title: 'Saldo insuficiente', description: 'Voce nao tem creditos suficientes para agendar esta aula.', action: 'Comprar creditos' },
    'en-US': { title: 'Insufficient balance', description: 'You do not have enough credits to book this lesson.', action: 'Buy credits' },
    'es-ES': { title: 'Saldo insuficiente', description: 'No tienes suficientes creditos para reservar esta clase.', action: 'Comprar creditos' },
    'it-IT': { title: 'Saldo insufficiente', description: 'Non hai crediti sufficienti per prenotare questa lezione.', action: 'Acquista crediti' },
  },

  /**
   * Exclusao de conta recusada porque ainda ha lotes de credito validos.
   * Emitido por `POST /api/v1/auth/delete-account` (409) junto de
   * `details.batches` — a quantidade viaja como numero, fora da copy, porque e
   * o unico detalhe que texto generico nao reproduz e nao tem idioma.
   */
  ACTIVE_CREDITS: {
    'pt-BR': { title: 'Creditos ainda ativos', description: 'Voce ainda tem creditos validos. Use-os antes de excluir a conta.', action: 'Agendar aula' },
    'en-US': { title: 'Credits still active', description: 'You still have valid credits. Use them before deleting your account.', action: 'Book a lesson' },
    'es-ES': { title: 'Creditos aun activos', description: 'Todavia tienes creditos validos. Usalos antes de eliminar la cuenta.', action: 'Reservar clase' },
    'it-IT': { title: 'Crediti ancora attivi', description: 'Hai ancora crediti validi. Usali prima di eliminare l\'account.', action: 'Prenota lezione' },
  },

  // ---- Payment ----
  PAY_001: {
    'pt-BR': { title: 'Pagamento recusado', description: 'Seu cartao foi recusado. Tente outro metodo de pagamento.', action: 'Trocar metodo' },
    'en-US': { title: 'Payment declined', description: 'Your card was declined. Try a different payment method.', action: 'Change method' },
    'es-ES': { title: 'Pago rechazado', description: 'Tu tarjeta fue rechazada. Prueba otro metodo de pago.', action: 'Cambiar metodo' },
    'it-IT': { title: 'Pagamento rifiutato', description: 'La tua carta e stata rifiutata. Prova un altro metodo.', action: 'Cambia metodo' },
  },
  PAY_002: {
    'pt-BR': { title: 'Pagamento expirado', description: 'O tempo para concluir o pagamento expirou.', action: 'Tentar novamente' },
    'en-US': { title: 'Payment expired', description: 'The time to complete your payment has expired.', action: 'Try again' },
    'es-ES': { title: 'Pago expirado', description: 'El tiempo para completar el pago ha expirado.', action: 'Reintentar' },
    'it-IT': { title: 'Pagamento scaduto', description: 'Il tempo per completare il pagamento e scaduto.', action: 'Riprova' },
  },
  PAY_003: {
    'pt-BR': { title: 'Erro no processamento', description: 'Nao conseguimos processar seu pagamento. Tente novamente em instantes.' },
    'en-US': { title: 'Processing error', description: 'We could not process your payment. Please try again shortly.' },
    'es-ES': { title: 'Error de procesamiento', description: 'No pudimos procesar tu pago. Intentalo en unos instantes.' },
    'it-IT': { title: 'Errore di elaborazione', description: 'Non siamo riusciti a elaborare il pagamento. Riprova a breve.' },
  },

  // ---- Network / Generic ----
  NET_001: {
    'pt-BR': { title: 'Sem conexao', description: 'Verifique sua conexao com a internet e tente novamente.' },
    'en-US': { title: 'No connection', description: 'Check your internet connection and try again.' },
    'es-ES': { title: 'Sin conexion', description: 'Revisa tu conexion a internet e intentalo de nuevo.' },
    'it-IT': { title: 'Nessuna connessione', description: 'Controlla la connessione internet e riprova.' },
  },
  RATE_LIMIT: {
    'pt-BR': { title: 'Muitas tentativas', description: 'Aguarde alguns instantes antes de tentar novamente.' },
    'en-US': { title: 'Too many attempts', description: 'Please wait a few moments before trying again.' },
    'es-ES': { title: 'Demasiados intentos', description: 'Espera unos momentos antes de intentarlo de nuevo.' },
    'it-IT': { title: 'Troppi tentativi', description: 'Attendi qualche istante prima di riprovare.' },
  },
  INTERNAL_ERROR: {
    'pt-BR': { title: 'Erro inesperado', description: 'Algo deu errado do nosso lado. Ja fomos notificados.', action: 'Tentar novamente' },
    'en-US': { title: 'Unexpected error', description: 'Something went wrong on our side. We have been notified.', action: 'Try again' },
    'es-ES': { title: 'Error inesperado', description: 'Algo salio mal de nuestro lado. Ya fuimos notificados.', action: 'Reintentar' },
    'it-IT': { title: 'Errore imprevisto', description: 'Qualcosa e andato storto da parte nostra. Siamo stati avvisati.', action: 'Riprova' },
  },
  /**
   * Requisicao interrompida antes da resposta. Cobre os dois casos que o
   * `api-client` colapsa num AbortError: o timeout de 30s e o cancelamento
   * deliberado (componente desmontado, busca substituida por outra).
   */
  ABORTED: {
    'pt-BR': { title: 'Tempo esgotado', description: 'A solicitacao demorou demais ou foi cancelada. Verifique sua conexao e tente novamente.', action: 'Tentar novamente' },
    'en-US': { title: 'Request timed out', description: 'The request took too long or was canceled. Check your connection and try again.', action: 'Try again' },
    'es-ES': { title: 'Tiempo agotado', description: 'La solicitud tardo demasiado o fue cancelada. Revisa tu conexion e intentalo de nuevo.', action: 'Reintentar' },
    'it-IT': { title: 'Tempo scaduto', description: 'La richiesta ha impiegato troppo tempo o e stata annullata. Controlla la connessione e riprova.', action: 'Riprova' },
  },
};

/**
 * Apelidos -> codigo canonico deste catalogo. Sao os codigos que o
 * `api-client` sintetiza quando a resposta nao traz `code` proprio
 * (`src/lib/api-client.ts`): renomea-los quebraria os consumidores que
 * ramificam pelo valor exato (`err.code === 'RATE_LIMITED'` em
 * `new-ticket-form.tsx`, `'NETWORK_ERROR'` no fluxo de rede), entao a
 * equivalencia mora aqui, no dono da copy.
 */
const CODE_ALIASES: Record<string, string> = {
  RATE_LIMITED: 'RATE_LIMIT',
  NETWORK_ERROR: 'NET_001',
};

const FALLBACK_CODE = 'INTERNAL_ERROR';

/**
 * Retorna copy UX para um error code, sempre no locale pedido.
 *
 * `locale` e OBRIGATORIO de proposito: um default fixo aqui reintroduziria o
 * defeito que este modulo existe para eliminar (mensagem em pt-BR para quem le
 * em outro idioma) sem que o chamador percebesse. Quem chama ja sabe o locale
 * ativo — no cliente, `src/lib/api-client.ts` o le do `<html lang>`.
 *
 * Codigo nao mapeado cai em INTERNAL_ERROR, tambem traduzido.
 */
export function getErrorCopy(code: string, locale: Locale): ErrorCopy {
  const canonical = CODE_ALIASES[code] ?? code;
  const entry = ERROR_COPY[canonical] ?? ERROR_COPY[FALLBACK_CODE];
  return entry[locale] ?? entry[defaultLocale];
}

/**
 * Locale ativo no cliente, para quem precisa de copy traduzida mas nao recebeu
 * o locale por parametro.
 *
 * A cadeia de resolucao (JWT -> header -> cookie -> Accept-Language) roda no
 * servidor, em `i18n/request.ts`; o resultado chega ao browser no `<html lang>`
 * que o root layout renderiza. Ler o DOM e, portanto, ler a decisao ja tomada —
 * nao uma segunda heuristica concorrente. Fora do browser, e diante de um `lang`
 * que nao seja locale suportado, cai em `defaultLocale`.
 *
 * Consumidor: `src/lib/api-client.ts`, que antes mantinha uma copia privada
 * desta mesma regra. A heuristica tem um dono so — este.
 */
export function activeLocale(): Locale {
  if (typeof document === 'undefined') return defaultLocale;
  const lang = document.documentElement.lang;
  return locales.find((candidate) => candidate === lang) ?? defaultLocale;
}

/**
 * Codigos que `getErrorCopy` resolve SEM cair no fallback — canonicos e
 * apelidos.
 *
 * Consumidor: `src/__tests__/i18n/error-copy-parity.test.ts`, que percorre a
 * lista para provar que todo codigo curado tem copy nao vazia nos quatro
 * locales e que codigo fora dela cai no fallback traduzido.
 */
export function listMappedCodes(): string[] {
  return [...Object.keys(ERROR_COPY), ...Object.keys(CODE_ALIASES)];
}
