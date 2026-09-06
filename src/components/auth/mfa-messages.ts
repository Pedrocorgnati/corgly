import { ApiError } from '@/lib/api-client';

export const TIMEOUT_MESSAGE =
  'A solicitação demorou demais. Verifique sua conexão e tente novamente.';
export const RATE_LIMIT_MESSAGE =
  'Muitas tentativas. Aguarde um minuto e tente novamente.';

/**
 * Traduz um erro da API de MFA para a mensagem exibida no formulario.
 * 429 chega do proxy com corpo em ingles ("Too many requests"): nunca exibir
 * o texto cru; timeout/abort tem mensagem propria; demais erros usam a
 * mensagem do servidor (ja em pt-BR) ou o fallback informado.
 */
export function describeMfaApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === 'ABORTED') return TIMEOUT_MESSAGE;
  if (err.status === 429 || err.code === 'RATE_LIMITED') return RATE_LIMIT_MESSAGE;
  return err.message || fallback;
}
