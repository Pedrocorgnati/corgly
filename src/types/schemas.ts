/**
 * @module types/schemas
 * Zod base schemas genéricos — Module 2: Shared Foundations
 *
 * CONTRATO: usar ApiResponse<T>, PaginatedResult<T> e ErrorResponse
 * como envelope padrão em todos os endpoints da API.
 */

import { z } from 'zod';

// ── ApiResponse<T> ──────────────────────────────────────────────────────────

/**
 * Cria schema de resposta de sucesso.
 * @example
 * const UserResponseSchema = ApiResponseSchema(UserSchema);
 * const result = UserResponseSchema.parse(json);
 */
export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      code: z.string().optional(),
    }),
  ]);
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ── PaginatedResult<T> ──────────────────────────────────────────────────────

/**
 * Cria schema de resultado paginado.
 * @example
 * const SessionListSchema = PaginatedResultSchema(SessionSchema);
 */
export function PaginatedResultSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ── ErrorResponse ────────────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ── PaginationParams ─────────────────────────────────────────────────────────

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
