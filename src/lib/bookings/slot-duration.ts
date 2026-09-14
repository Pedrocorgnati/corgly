/**
 * Duracao de um horario de disponibilidade, em minutos inteiros, lida do proprio
 * horario (`endAt - startAt`, arredondado para o minuto mais proximo).
 *
 * Ate 2026-09-11 o caminho do aluno exibia um 50 cravado e nunca lia `endAt`,
 * que ja vinha no payload. Devolve `null` quando a duracao nao pode ser exibida:
 * data ilegivel, fim igual ou anterior ao inicio, ou menos de meio minuto. O banco
 * nao tem `CHECK (endAt > startAt)`, entao esse caso existe; quem chama omite o
 * trecho de duracao em vez de mostrar `NaN`, `0` ou valor negativo.
 */
export function slotDurationMinutes(slot: { startAt: string; endAt: string }): number | null {
  const minutes = Math.round((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
