/**
 * Configuração centralizada do Stripe Customer Portal.
 *
 * Decisão canônica: ADR-0003 (Stripe Customer Portal embed vs redirect).
 * Modo escolhido = `redirect` para o portal hospedado da Stripe. O portal NÃO
 * suporta embed via iframe (Stripe envia `X-Frame-Options`/CSP `frame-ancestors`
 * que bloqueiam o embed em qualquer origem), então o fluxo é sempre full-page
 * redirect com `return_url` para trazer o usuário de volta.
 *
 * Este módulo NÃO contém segredos e não importa `server-only`, podendo ser
 * consumido tanto pela camada de serviço (server) quanto por telas client que
 * precisem do path de retorno canônico.
 */

/** Modo de integração do Customer Portal. */
export type CustomerPortalMode = 'redirect' | 'embed';

/**
 * Modo de integração efetivo. Fixado em `redirect` por limitação da Stripe
 * (portal hospedado, sem suporte a iframe). Ver ADR-0003 §Decisão.
 */
export const CUSTOMER_PORTAL_MODE: CustomerPortalMode = 'redirect';

/**
 * Path (relativo ao app) usado como `return_url` padrão quando o caller não
 * informa um `returnTo` válido. Mantido como path para ser resolvido contra
 * `NEXT_PUBLIC_APP_URL` na camada de serviço.
 */
export const CUSTOMER_PORTAL_DEFAULT_RETURN_PATH = '/billing/subscription';

/**
 * Path de retorno usado pelas telas ST-22 (Assinatura) e ST-23 (Past Due banner)
 * ao abrir o portal. Inclui o marcador `?portal=returned` para a UI reagir ao
 * retorno do usuário (revalidar status da assinatura).
 */
export const CUSTOMER_PORTAL_RETURN_AFTER_PATH =
  '/billing/subscription?portal=returned';

/**
 * Tamanho máximo aceito para `returnTo` recebido do cliente (defesa contra
 * payload abusivo antes da validação same-origin na camada de serviço).
 */
export const CUSTOMER_PORTAL_RETURN_TO_MAX_LENGTH = 300;
