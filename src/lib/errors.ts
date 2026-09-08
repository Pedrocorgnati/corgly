/**
 * AppError — erro de negócio com código rastreável pelo ERROR-CATALOG.
 * Use `code` para mapear ao catalogo (ex: AUTH_001, CREDIT_050, VAL_003).
 *
 * `details` e opcional e carrega o payload estruturado que a rota decide (ou
 * nao) devolver ao cliente. Hoje o unico consumidor e
 * `POST /api/v1/admin/exercises/[id]/assignments`, que precisa dizer QUAIS
 * alunos foram recusados e por que. Erro sem `details` continua com a forma
 * antiga: quarto argumento ausente => `undefined`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
