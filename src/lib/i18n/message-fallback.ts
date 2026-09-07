/**
 * @module lib/i18n/message-fallback
 *
 * Fallback unico para chave de traducao AUSENTE.
 *
 * Traducao e obrigatoria: chave ausente e DEFEITO, nao texto opcional. Este
 * modulo define o que acontece quando o defeito escapa para o runtime, e existe
 * porque a mesma decisao estava copiada em varios componentes com respostas
 * DIFERENTES para o mesmo caso (um devolvia string vazia, outro devolvia um
 * rotulo legivel). Duas politicas para o mesmo defeito e um bug por si so.
 *
 * Politica canonica, em dois regimes:
 *
 *  - fora de producao (dev e teste): estoura. A falha fica alta e barulhenta
 *    exatamente onde da para consertar — no primeiro render que pede a chave.
 *  - em producao: NUNCA devolve string vazia. Tela muda e Zero Silencio
 *    violado: o rotulo some, o botao fica sem texto e ninguem — nem usuario nem
 *    operador — recebe sinal. Entao registra no logger estruturado (observavel
 *    em producao) e devolve um rotulo legivel derivado da folha da chave. Nunca
 *    a chave crua.
 *
 * Uso:
 *   import { missingMessage } from '@/lib/i18n/message-fallback';
 *   const t = useTranslations('credits.pricing');
 *   const text = (key: string): string =>
 *     t.has(key) ? t(key) : missingMessage(`credits.pricing.${key}`, 'PricingCards');
 */

import { logger } from '@/lib/logger';

/**
 * `checkoutError` -> `Checkout error`; `fail_title` -> `Fail title`.
 * Rotulo de emergencia: pior que a traducao certa, melhor que espaco em branco
 * ou que expor `credits.pricing.checkoutError` ao aluno.
 */
function humanizeMessageKey(fullKey: string): string {
  const leaf = fullKey.split('.').pop() ?? fullKey;
  const words = leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!words) return fullKey;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/**
 * @param fullKey caminho COMPLETO da chave (namespace incluso), para o log
 *   apontar direto o que falta no catalogo.
 * @param component nome do consumidor, para o log dizer QUAL tela ficou sem
 *   copy sem depender de stack trace minificada.
 * @throws Error fora de producao — chave ausente e defeito de build.
 */
export function missingMessage(fullKey: string, component: string): string {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[i18n] chave de traducao ausente: ${fullKey} (${component})`);
  }
  logger.error('[i18n] chave de traducao ausente', {
    action: 'i18n.missing_key',
    component,
    messageKey: fullKey,
  });
  return humanizeMessageKey(fullKey);
}
