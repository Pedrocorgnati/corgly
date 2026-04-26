/**
 * @module lib/errors/copy
 * Mapa de error codes -> copy UX multilingue (pt-BR, en-US, es-ES, it-IT).
 * Usado por toasts, inline errors e error pages para traduzir codigos tecnicos
 * em mensagens acionaveis. Referencia: ERROR-CATALOG do projeto.
 *
 * Uso:
 *   import { getErrorCopy } from '@/lib/errors/copy';
 *   const { title, description, action } = getErrorCopy('AUTH_001', locale);
 */

export type SupportedLocale = 'pt-BR' | 'en-US' | 'es-ES' | 'it-IT';

export interface ErrorCopy {
  title: string;
  description: string;
  action?: string;
}

type LocaleMap = Record<SupportedLocale, ErrorCopy>;

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
};

const FALLBACK_CODE = 'INTERNAL_ERROR';
const DEFAULT_LOCALE: SupportedLocale = 'pt-BR';

/**
 * Retorna copy UX para um error code.
 * Faz fallback para INTERNAL_ERROR quando o codigo nao esta mapeado,
 * e para pt-BR quando o locale nao esta disponivel.
 */
export function getErrorCopy(code: string, locale: SupportedLocale = DEFAULT_LOCALE): ErrorCopy {
  const entry = ERROR_COPY[code] ?? ERROR_COPY[FALLBACK_CODE];
  return entry[locale] ?? entry[DEFAULT_LOCALE];
}

/** Lista de todos codigos mapeados — util para testes de cobertura. */
export function listMappedCodes(): string[] {
  return Object.keys(ERROR_COPY);
}
