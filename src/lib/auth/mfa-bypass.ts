/**
 * Bypass do gate de MFA admin para desenvolvimento local.
 *
 * Fail-closed: o bypass so vale quando NODE_ENV === 'development' E
 * ADMIN_MFA_DEV_BYPASS === 'true' (string exata). Qualquer outra combinacao
 * mantem o gate ligado. Fora de development o valor 'true' e ainda recusado no
 * boot por src/lib/env.ts (superRefine), entao a checagem aqui e a segunda linha
 * de defesa, nao a unica.
 *
 * Onde configurar: `.env.development.local` (carregado apenas por `next dev`).
 * NUNCA em `.env`, que e lido em todos os modos (inclusive `next build`, que
 * roda com NODE_ENV=production e recusaria o boot).
 *
 * Consumidores: src/proxy.ts (redirect para /auth/mfa/challenge) e
 * src/lib/auth/admin-mfa.guard.ts (403 mfa_required em route handlers).
 *
 * O modulo NAO importa 'server-only' nem '@/lib/env' de proposito: o proxy
 * precisa dele e le process.env em tempo de request, como ja faz com
 * MAINTENANCE_MODE.
 */

let warnedOnce = false;

export function isAdminMfaBypassed(env: NodeJS.ProcessEnv = process.env): boolean {
  const bypassed =
    env.NODE_ENV === 'development' && env.ADMIN_MFA_DEV_BYPASS === 'true';

  if (bypassed && !warnedOnce) {
    warnedOnce = true;
    console.warn(
      '[mfa] ADMIN_MFA_DEV_BYPASS=true: gate de MFA admin DESLIGADO (somente development).',
    );
  }

  return bypassed;
}
