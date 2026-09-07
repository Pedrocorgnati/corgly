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
  // Secret dedicado do token de entrada da sessão (§12.3). Opcional no schema
  // para não quebrar o boot; o service exige presença (>=32) ao emitir (500).
  SESSION_ENTRY_TOKEN_SECRET: z
    .string()
    .min(32, 'SESSION_ENTRY_TOKEN_SECRET deve ter no mínimo 32 caracteres')
    .optional(),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY deve ter no mínimo 32 caracteres'),
  // Secret dedicado para assinar URLs de upload/download de assets (T-058 / §12.4).
  // Opcional no boot; o helper de storage cai em SESSION_ENTRY_TOKEN_SECRET ->
  // JWT_SECRET quando ausente e exige presença (>=32) ao assinar (500 caso falte).
  ASSET_URL_SIGNING_SECRET: z
    .string()
    .min(32, 'ASSET_URL_SIGNING_SECRET deve ter no mínimo 32 caracteres')
    .optional(),

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

  // Captcha de formulário público (Cloudflare Turnstile) — OPCIONAL.
  // Sem o secret, a verificação vira no-op e apenas o honeypot + rate limit
  // protegem a captação pública de leads (T-053).
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

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

  // Bypass do gate de MFA admin — SOMENTE desenvolvimento local.
  // Configurar em `.env.development.local` (lido apenas por `next dev`), nunca
  // em `.env`. Com valor 'true' fora de NODE_ENV=development o boot e recusado
  // (superRefine abaixo). Consumido por src/lib/auth/mfa-bypass.ts.
  ADMIN_MFA_DEV_BYPASS: z.enum(['true', 'false']).optional(),
}).superRefine((data, ctx) => {
  if (data.ADMIN_MFA_DEV_BYPASS === 'true' && data.NODE_ENV !== 'development') {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_MFA_DEV_BYPASS'],
      message:
        "ADMIN_MFA_DEV_BYPASS=true só é permitido com NODE_ENV=development (defina apenas em .env.development.local)",
    });
  }

  // URL publica apontando para a propria maquina em producao: reprova.
  //
  // `NEXT_PUBLIC_*` e INLINEADO no bundle em tempo de build (tambem no codigo de
  // servidor), entao um build feito com o `.env` de desenvolvimento carrega
  // `http://localhost:3000` para dentro do artefato e nenhuma troca de `.env` no
  // servidor desfaz isso. Foi assim que a producao de 2026-09-07 subiu com
  // `internalApiOrigin()` compilado como `return "http://localhost:3000"`: todo
  // Server Component que chama `getAuthUser()` falhava o fetch, concluia "sem
  // sessao" e devolvia a area logada inteira para /auth/login — com o login
  // respondendo 200 e o cookie valido. Stripe e os emails saiam com link de
  // localhost pelo mesmo motivo.
  //
  // O valor certo do build de producao mora em `.env.production` (versionado).
  // Este guard existe para o erro voltar como build quebrado, nao como deploy
  // silenciosamente quebrado.
  if (data.NODE_ENV === 'production') {
    for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL'] as const) {
      const value = data[key];
      let hostname: string;
      try {
        hostname = new URL(value).hostname;
      } catch {
        continue; // formato invalido ja e acusado pelo `.url()` do schema
      }
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            `${key} nao pode apontar para loopback (${value}) com NODE_ENV=production. ` +
            'Defina a URL publica em .env.production — o valor e inlineado no bundle e nao ha como corrigi-lo depois do build.',
        });
      }
    }
  }
});

// dotenv sempre entrega string: uma chave declarada e vazia (`TURN_SERVER_URL=`)
// chega como '' e reprova em `.url().optional()` mesmo sendo opcional, derrubando
// o boot inteiro. Os templates do proprio projeto (.env.example, .env.docker,
// .env.docker.example) usam `CHAVE=` como "nao configurado", entao string vazia e
// normalizada para ausente antes do parse. Isso NAO afrouxa variavel obrigatoria:
// sem a chave o schema acusa campo faltando e o boot continua sendo recusado.
const _rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ''),
) as NodeJS.ProcessEnv;

const _parsed = envSchema.safeParse(_rawEnv);

if (!_parsed.success) {
  const formatted = _parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`❌ Variáveis de ambiente inválidas:\n${formatted}`);
}

export const env = _parsed.data;
