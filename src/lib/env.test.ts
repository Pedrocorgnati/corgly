// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_ENV: Record<string, string> = {
  DATABASE_URL: 'mysql://test:test@localhost:3306/test',
  JWT_SECRET: 'x'.repeat(32),
  JWT_EXPIRES_IN: '7d',
  CRON_SECRET: 'x'.repeat(16),
  HOCUSPOCUS_JWT_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: 'x'.repeat(32),
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  RESEND_API_KEY: 're_test_fake',
  EMAIL_FROM: 'noreply@corgly.test',
  // URL publica (nao-loopback) de proposito: a maioria dos casos abaixo roda com
  // NODE_ENV=production, e o guard de loopback reprovaria localhost ali.
  NEXT_PUBLIC_APP_URL: 'https://app.corgly.test',
  NEXT_PUBLIC_SITE_URL: 'https://app.corgly.test',
  NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...VALID_ENV, ...overrides })) {
    vi.stubEnv(k, v === undefined ? '' : v);
  }
  return import('./env');
}

describe('env: ADMIN_MFA_DEV_BYPASS', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('aceita true em development', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development', ADMIN_MFA_DEV_BYPASS: 'true' });
    expect(mod.env.ADMIN_MFA_DEV_BYPASS).toBe('true');
  });

  it('recusa true em production (boot falha)', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', ADMIN_MFA_DEV_BYPASS: 'true' }),
    ).rejects.toThrow(/ADMIN_MFA_DEV_BYPASS/);
  });

  it('recusa true em test (boot falha)', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'test', ADMIN_MFA_DEV_BYPASS: 'true' }),
    ).rejects.toThrow(/ADMIN_MFA_DEV_BYPASS/);
  });

  it('aceita false em production', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', ADMIN_MFA_DEV_BYPASS: 'false' });
    expect(mod.env.ADMIN_MFA_DEV_BYPASS).toBe('false');
  });

  it('aceita ausente (string vazia e filtrada) em production', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', ADMIN_MFA_DEV_BYPASS: undefined });
    expect(mod.env.ADMIN_MFA_DEV_BYPASS).toBeUndefined();
  });

  it('recusa valores fora de true/false (ex.: TRUE)', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'development', ADMIN_MFA_DEV_BYPASS: 'TRUE' }),
    ).rejects.toThrow(/ADMIN_MFA_DEV_BYPASS/);
  });
});

describe('env: normalizacao de string vazia', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Regressao: o .env real do projeto declara `TURN_SERVER_URL=` (e os templates
  // .env.example / .env.docker / .env.docker.example fazem o mesmo). Sem a
  // normalizacao o zod acusa "Invalid URL" e o boot inteiro cai, derrubando ate o
  // proxy (que importa este modulo via @/lib/auth) com 500 em toda rota.
  it('var OPCIONAL declarada vazia vira ausente e nao derruba o boot', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', TURN_SERVER_URL: '' });
    expect(mod.env.TURN_SERVER_URL).toBeUndefined();
  });

  it('URL opcional vazia (NEXT_PUBLIC_SENTRY_DSN) tambem vira ausente', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: '' });
    expect(mod.env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it('var OBRIGATORIA declarada vazia continua reprovando o boot', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', JWT_SECRET: '' }),
    ).rejects.toThrow(/JWT_SECRET/);
  });

  it('URL obrigatoria declarada vazia continua reprovando o boot', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: '' }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});

describe('env: URL publica de loopback em producao', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Regressao 2026-09-07: o build de producao saiu com NEXT_PUBLIC_APP_URL em
  // localhost (o `.env` de desenvolvimento). Como `NEXT_PUBLIC_*` e inlineado no
  // bundle, o erro so apareceu em producao — e nenhuma troca de `.env` no
  // servidor o desfazia. O boot precisa reprovar antes disso.
  it.each([
    ['NEXT_PUBLIC_APP_URL', 'http://localhost:3000'],
    ['NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000'],
    ['NEXT_PUBLIC_SITE_URL', 'http://localhost:3000'],
  ])('recusa %s em %s com NODE_ENV=production', async (key, value) => {
    await expect(
      loadEnv({ NODE_ENV: 'production', [key]: value }),
    ).rejects.toThrow(new RegExp(key));
  });

  it('aceita loopback fora de producao (development)', async () => {
    const mod = await loadEnv({
      NODE_ENV: 'development',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    });
    expect(mod.env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('aceita URL publica em producao', async () => {
    const mod = await loadEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://corgly.app',
    });
    expect(mod.env.NEXT_PUBLIC_APP_URL).toBe('https://corgly.app');
  });
});
