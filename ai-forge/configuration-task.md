# Configuration Tasks — Corgly
> Gerado por `/nextjs:configuration` em 2026-03-23

---

### T001 – Validação centralizada de variáveis de ambiente com Zod
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- criar: `src/lib/env.ts`
- modificar: `src/lib/auth.ts`, `src/lib/stripe.ts`, `src/lib/rate-limit.ts`, `src/lib/iceServers.ts`, `src/actions/progress.ts`, `src/actions/dashboard.ts`, `src/actions/sessions.ts`, `src/actions/admin-dashboard.ts`, `src/actions/admin-students.ts`, `src/actions/onboarding.actions.ts`, `src/actions/consent.actions.ts`

**Descrição:**
Atualmente, variáveis críticas como `JWT_SECRET`, `STRIPE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL` e `TURN_SERVER_SECRET` são acessadas via `process.env.FOO!` ou com fallbacks inline (`?? 'http://localhost:3000'`). Não existe validação no boot da aplicação. Se uma variável obrigatória estiver ausente em produção, o erro ocorrerá em tempo de execução, não na inicialização.

**Solução:**
Criar `src/lib/env.ts` com Zod (ou `@t3-oss/env-nextjs`) que:
1. Declara todas as variáveis públicas (`NEXT_PUBLIC_*`) e privadas
2. Valida tipos e formatos (URL, min-length para secrets)
3. Lança exceção no boot se alguma variável obrigatória estiver ausente
4. É importado por todos os arquivos que precisam de `process.env`

```ts
// src/lib/env.ts (exemplo mínimo)
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CRON_SECRET: z.string().min(16),
  HOCUSPOCUS_JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email().or(z.string().includes('<')),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  TURN_SERVER_URL: z.string().url().optional(),
  TURN_SERVER_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z.string(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Critérios de Aceite:**
- `src/lib/env.ts` exporta `env` validado com Zod
- Todos os arquivos que usam `process.env.FOO` passam a usar `env.FOO`
- Build falha com mensagem clara se variável obrigatória ausente
- `NEXT_PUBLIC_*` e privadas corretamente separadas
- Estimativa: 2h

---

### T002 – Scripts críticos ausentes no package.json
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** [x] COMPLETED

**Arquivos:**
- modificar: `package.json`

**Descrição:**
Faltam scripts essenciais para garantir qualidade antes do build e para automação de CI/CD:
- `type-check`: executa `tsc --noEmit` para validar tipos sem build
- `validate`: encadeia lint + type-check + test (gate pre-build)
- `postinstall`: executa `prisma generate` automaticamente após `npm install`
- `analyze`: build com bundle analyzer para monitorar tamanho

**Solução:**
```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "validate": "npm run lint && npm run type-check && npm run test",
    "postinstall": "prisma generate",
    "analyze": "ANALYZE=true next build"
  }
}
```

**Critérios de Aceite:**
- `npm run type-check` executa sem erro
- `npm run validate` encadeia lint + type-check + test
- `npm install` gera automaticamente o Prisma client
- Estimativa: 15min

---

### T003 – Declarar engines e packageManager no package.json
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- modificar: `package.json`

**Descrição:**
Sem `engines` declarado, o projeto pode ser instalado com versões incompatíveis de Node.js. O projeto usa Next.js 16 + React 19 que requerem Node >= 18.17.0.

**Solução:**
```json
{
  "engines": {
    "node": ">=18.17.0",
    "npm": ">=9.0.0"
  }
}
```

**Critérios de Aceite:**
- `engines` declarado com versões mínimas corretas
- Estimativa: 5min

---

### T004 – Criar .nvmrc e .npmrc
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- criar: `.nvmrc`
- criar: `.npmrc`

**Descrição:**
Sem `.nvmrc`, desenvolvedores podem usar versões erradas de Node. Sem `.npmrc`, o projeto não enforça `engine-strict` nem `save-exact` para lockfile previsível.

**Solução:**

`.nvmrc`:
```
20
```

`.npmrc`:
```
engine-strict=true
save-exact=false
loglevel=warn
```

**Critérios de Aceite:**
- `.nvmrc` com versão LTS atual do Node (20)
- `.npmrc` com `engine-strict=true`
- Estimativa: 5min

---

### T005 – Adicionar reactStrictMode ao next.config.ts
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- modificar: `next.config.ts`

**Descrição:**
`reactStrictMode` não está definido explicitamente. Por padrão o Next.js 15+ habilita no dev, mas é boa prática declará-lo explicitamente para evitar ambiguidade.

**Solução:**
```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // ...
};
```

**Critérios de Aceite:**
- `reactStrictMode: true` presente no config
- Estimativa: 2min

---

### T006 – Configurar images.remotePatterns no next.config.ts
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- modificar: `next.config.ts`

**Descrição:**
Sem `images.remotePatterns`, o componente `next/image` não pode carregar imagens de domínios externos. Em produção isso pode bloquear avatares, thumbnails ou imagens de CDN. Também é importante declarar formatos modernos (`webp`, `avif`).

**Solução:**
```ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.corgly.app',
      },
      // Adicionar outros domínios conforme necessário (ex: S3, Cloudinary)
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // ...
};
```

**Critérios de Aceite:**
- `remotePatterns` configurado com domínios específicos (não wildcard genérico)
- `formats` modernos declarados
- Estimativa: 10min

---

### T007 – Documentar NEXT_PUBLIC_SENTRY_DSN no .env.example
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Status:** [x] COMPLETED

**Arquivos:**
- modificar: `.env.example`

**Descrição:**
`NEXT_PUBLIC_SENTRY_DSN` é referenciado em `src/lib/logger.ts` mas não está documentado no `.env.example`. Desenvolvedores novos não saberão que precisam configurá-lo para error tracking.

**Solução:**
Adicionar ao `.env.example`:
```bash
# ERROR TRACKING (Sentry) — opcional, mas recomendado em produção
# NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
```

**Critérios de Aceite:**
- `NEXT_PUBLIC_SENTRY_DSN` documentado e comentado no `.env.example`
- Também adicionado ao schema do `src/lib/env.ts` como opcional
- Estimativa: 5min
