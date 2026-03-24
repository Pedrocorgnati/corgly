/**
 * AppError — erro de negócio com código rastreável pelo ERROR-CATALOG.
 * Use `code` para mapear ao catalogo (ex: AUTH_001, CREDIT_050, VAL_003).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
