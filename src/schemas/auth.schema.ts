import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  country: z.string().length(2).optional(),
  timezone: z.string().min(1).max(100),
  termsAccepted: z.literal(true, { message: 'Você deve aceitar os termos de uso' }),
  marketingOptIn: z.boolean().optional().default(false),
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

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ConfirmEmailInput = z.infer<typeof ConfirmEmailSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
