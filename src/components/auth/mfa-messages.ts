import { ApiError } from '@/lib/api-client';

/**
 * Ate 2026-09-07 as duas mensagens abaixo eram constantes de modulo em portugues
 * cravado — fora do alcance do next-intl. Agora o tradutor do chamador entra como
 * parametro e so a decisao de QUAL mensagem usar mora aqui.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Traduz um erro da API de MFA para a mensagem exibida no formulario.
 * 429 chega do proxy com corpo em ingles ("Too many requests"): nunca exibir
 * o texto cru; timeout/abort tem mensagem propria; demais erros usam a
 * mensagem do servidor ou o fallback informado.
 */
export function describeMfaApiError(err: unknown, fallback: string, t: Translator): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === 'ABORTED') return t('timeout');
  if (err.status === 429 || err.code === 'RATE_LIMITED') return t('rateLimit');
  return err.message || fallback;
}
