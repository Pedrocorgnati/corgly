/**
 * Defaults de ambiente para a suite de testes.
 *
 * `src/lib/env.ts` valida o ambiente com Zod no topo do modulo e LANCA quando
 * falta qualquer variavel obrigatoria. Qualquer teste que importe (mesmo que
 * transitivamente) `@/lib/auth`, `@/lib/rate-limit`, `@/lib/stripe` etc morria
 * na COLETA, antes de rodar um unico caso.
 *
 * O repositorio tem um `.env.test`, mas ele e gitignored (`.gitignore: .env.*`)
 * e nao esta versionado — depender dele deixaria a suite verde so na maquina de
 * quem criou o arquivo. Por isso os defaults vivem aqui, versionados.
 *
 * Regras:
 * - Sao valores FALSOS e obviamente sinteticos. Nenhum segredo real entra aqui.
 * - So preenchem o que esta AUSENTE (`??=`): um valor ja exportado no ambiente
 *   (CI, `.env.test` carregado a mao, `DATABASE_URL_TEST` etc) continua vencendo.
 * - Este arquivo e o PRIMEIRO `setupFiles`, portanto roda antes de qualquer
 *   import do arquivo de teste.
 */
const TEST_ENV_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'mysql://test:test@localhost:3306/corgly_test',
  JWT_SECRET: 'test-jwt-secret-nao-use-em-producao-0123456789',
  JWT_EXPIRES_IN: '7d',
  CRON_SECRET: 'test-cron-secret-nao-use-em-producao',
  HOCUSPOCUS_JWT_SECRET: 'test-hocuspocus-secret-nao-use-em-producao-0123',
  ENCRYPTION_KEY: 'test-encryption-key-nao-use-em-producao-0123456',
  SESSION_ENTRY_TOKEN_SECRET: 'test-session-entry-secret-nao-use-em-producao-01',
  ASSET_URL_SIGNING_SECRET: 'test-asset-signing-secret-nao-use-em-producao-01',
  STRIPE_SECRET_KEY: 'sk_test_000000000000000000000000',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_000000000000000000000000',
  RESEND_API_KEY: 're_test_000000000000000000000000',
  EMAIL_FROM: 'no-reply@test.corgly.local',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3110',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3110',
  NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

export {};
