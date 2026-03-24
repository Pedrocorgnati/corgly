import { z } from 'zod';

const envSchema = z.object({
  // Ambiente
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Banco de dados
  DATABASE_URL: z.string().url(),

  // Segurança / JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET deve ter no mínimo 16 caracteres'),
  HOCUSPOCUS_JWT_SECRET: z
    .string()
    .min(32, 'HOCUSPOCUS_JWT_SECRET deve ter no mínimo 32 caracteres'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY deve ter no mínimo 32 caracteres'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', 'STRIPE_SECRET_KEY deve começar com sk_'),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith('whsec_', 'STRIPE_WEBHOOK_SECRET deve começar com whsec_'),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY é obrigatório'),
  EMAIL_FROM: z.string().min(1, 'EMAIL_FROM é obrigatório'),

  // Redis (Upstash) — opcional em dev, obrigatório em produção
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // WebRTC TURN — opcional
  TURN_SERVER_URL: z.string().url().optional(),
  TURN_SERVER_SECRET: z.string().optional(),

  // Variáveis públicas (NEXT_PUBLIC_*)
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL deve ser uma URL válida'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL deve ser uma URL válida'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z
    .string()
    .min(1, 'NEXT_PUBLIC_HOCUSPOCUS_URL é obrigatório'),

  // SEO — opcionais
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),

  // Error Tracking — opcional
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  const formatted = _parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`❌ Variáveis de ambiente inválidas:\n${formatted}`);
}

export const env = _parsed.data;
