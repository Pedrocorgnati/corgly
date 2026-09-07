/**
 * Contrato compartilhado entre a pagina de magic-link e o Route Handler que
 * consome o token.
 *
 * Modulo puro (sem `next/*`) porque os dois lados o importam: a pagina (Server
 * Component) monta a URL do callback e le o codigo de erro; o handler monta a
 * URL de volta para a pagina.
 */

/** Path do Route Handler que consome o token e emite o cookie de sessao. */
export const MAGIC_LINK_CALLBACK_PATH = '/auth/magic-link/callback';

/** Nome do parametro que carrega o token cru enviado por email. */
export const MAGIC_LINK_TOKEN_PARAM = 'token';

/** Nome do parametro com que o callback devolve a falha para a pagina. */
export const MAGIC_LINK_ERROR_PARAM = 'error';

/**
 * Codigos de falha que o callback pode devolver. Sao os UNICOS valores que a
 * pagina reconhece; qualquer outro cai no texto generico de link invalido.
 */
export const MAGIC_LINK_ERRORS = {
  /** Token ausente, ja consumido, expirado ou inexistente. Estado terminal. */
  INVALID: 'link-invalido',
  /** Falha de infraestrutura ao consumir o token. O usuario pode tentar de novo. */
  UNAVAILABLE: 'indisponivel',
} as const;

export type MagicLinkErrorCode = (typeof MAGIC_LINK_ERRORS)[keyof typeof MAGIC_LINK_ERRORS];
