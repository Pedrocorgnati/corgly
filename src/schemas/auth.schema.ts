import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').max(255),
  email: z.string().email('Informe um email válido').max(255),
  password: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .max(128)
    .regex(/[A-Z]/, 'A senha deve conter: letra maiúscula, número e símbolo')
    .regex(/[0-9]/, 'A senha deve conter: letra maiúscula, número e símbolo')
    .regex(/[^a-zA-Z0-9]/, 'A senha deve conter: letra maiúscula, número e símbolo'),
  country: z.string().min(1, 'Selecione seu país'),
  timezone: z.string().min(1, 'Selecione seu fuso horário').max(100),
  termsAccepted: z.boolean().refine((v) => v === true, {
    message: 'Você precisa aceitar os termos para continuar',
  }),
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: 'Você precisa consentir com o tratamento de dados para continuar',
  }),
  marketingOptIn: z.boolean().optional(),
});

/** Schema do formulário de registro (client-side, inclui confirmPassword) */
export const RegisterFormSchema = RegisterSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem',
  });

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const ConfirmEmailSchema = z.object({
  token: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  country: z.string().length(2).optional().nullable(),
  timezone: z.string().min(1).max(100).optional(),
  preferredLanguage: z.enum(['PT_BR', 'EN_US', 'ES_ES', 'IT_IT']).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const ResendConfirmationSchema = z.object({
  email: z.string().email(),
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1),
  confirmation: z.literal('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' }),
});

export const CookieConsentSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type RegisterFormInput = z.infer<typeof RegisterFormSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ConfirmEmailInput = z.infer<typeof ConfirmEmailSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type ResendConfirmationInput = z.infer<typeof ResendConfirmationSchema>;
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
export type CookieConsentInput = z.infer<typeof CookieConsentSchema>;
