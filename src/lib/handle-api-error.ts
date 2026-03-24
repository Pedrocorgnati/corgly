/**
 * @module lib/handle-api-error
 * Tratamento centralizado de erros da API — Module 2: Shared Foundations
 */

import { ApiError } from './api-client';

/**
 * Re-lança ApiError como está.
 * Converte Error genérico ou unknown para ApiError status 500.
 * @throws ApiError — sempre
 */
export function handleApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof Error) {
    throw new ApiError(error.message, 500, 'INTERNAL_ERROR');
  }

  throw new ApiError('Erro interno inesperado.', 500, 'INTERNAL_ERROR');
}
