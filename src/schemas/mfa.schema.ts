import { z } from 'zod';

/**
 * Schemas de validacao do fluxo MFA TOTP (admin).
 * Chaves/valores em pt-BR para mensagens exibidas ao usuario.
 */

/**
 * Verificacao de codigo: aceita um TOTP de 6 digitos OU um codigo de
 * recuperacao (formato XXXX-XXXX-XXXX, tolerante a espacos/minusculas).
 * A discriminacao TOTP vs recovery e feita no service via `looksLikeTotpCode`.
 */
export const MfaVerifySchema = z.object({
  code: z
    .string()
    .min(6, 'Informe o código de 6 dígitos ou um código de recuperação')
    .max(32, 'Código inválido')
    .transform((v) => v.trim()),
});

export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;
