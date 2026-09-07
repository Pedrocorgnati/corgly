/**
 * @module lib/timeout-signal
 * `AbortSignal.timeout` tolerante a browser que nao o implementa.
 *
 * `AbortSignal.timeout` so existe no Safari a partir da versao 16. Chamado
 * cru, ele nao devolve `undefined` num browser antigo: ele LANCA
 * (`AbortSignal.timeout is not a function`), e lanca SINCRONAMENTE, no momento
 * em que o objeto `RequestInit` e montado — quase sempre fora de qualquer
 * `try`, porque o `try` costuma comecar no `await fetch(...)`.
 *
 * O efeito e sempre o mesmo e nunca e "a requisicao vai sem timeout": e a
 * funcao inteira morrendo antes de disparar a chamada. No banner de cookies a
 * excecao escapava do `onClick` (o banner vive no layout raiz); nos hooks de
 * sinalizacao e WebRTC derruba a tentativa de conexao da aula inteira, que e
 * pior — o aluno ve a sala falhar sem motivo aparente.
 *
 * Aqui a ausencia degrada para "requisicao sem prazo" em vez de derrubar o
 * fluxo. `undefined` em `RequestInit.signal` e exatamente equivalente a nao
 * passar o campo, entao o call site nao precisa ramificar.
 *
 * Uso:
 *   import { timeoutSignal } from '@/lib/timeout-signal';
 *   await fetch(url, { signal: timeoutSignal(10_000) });
 */

export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }
  return AbortSignal.timeout(ms);
}
