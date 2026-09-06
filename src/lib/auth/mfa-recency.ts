/**
 * Janela canonica de "MFA recente" para rotas admin sensiveis.
 *
 * 15 minutos (NIST SP 800-63B §4.1.2 — re-autenticacao de sessao privilegiada).
 * Consumido por T-045: admin-mfa.guard.ts e proxy (src/proxy.ts) de admin UI.
 *
 * Janela RATIFICADA pelo operador em 2026-06-22 como politica canonica de
 * re-autenticacao admin (listener-recovery, canal interactive/RESSALVAS).
 * Esta constante e a casa canonica do valor; consumidores devem importar daqui.
 */
export const MFA_RECENT_WINDOW_SECONDS = 15 * 60; // 900 s

/**
 * Retorna true se o claim mfaAt (epoch s) e recente o suficiente.
 * Passa nowMs para facilitar testes deterministas.
 */
export function isMfaRecent(
  mfaAt: number | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!mfaAt) return false;
  const ageSeconds = (nowMs / 1000) - mfaAt;
  return ageSeconds <= MFA_RECENT_WINDOW_SECONDS;
}
