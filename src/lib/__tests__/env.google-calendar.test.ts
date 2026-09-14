// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  DATABASE_URL: 'mysql://user:pass@localhost:3306/test',
  JWT_SECRET: 'x'.repeat(32),
  JWT_EXPIRES_IN: '7d',
  CRON_SECRET: 'x'.repeat(16),
  HOCUSPOCUS_JWT_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: 'x'.repeat(32),
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  RESEND_API_KEY: 're_test_fake',
  EMAIL_FROM: 'noreply@corgly.test',
  NEXT_PUBLIC_APP_URL: 'https://corgly.test',
  NEXT_PUBLIC_SITE_URL: 'https://corgly.test',
  NEXT_PUBLIC_HOCUSPOCUS_URL: 'wss://corgly.test/ws',
};

describe('GOOGLE_CALENDAR_WEBHOOK_URL', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(REQUIRED_ENV)) vi.stubEnv(key, value);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GOOGLE_CALENDAR_WEBHOOK_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('e opcional no boot de teste mas obrigatoria no ponto de uso', async () => {
    const envModule = await import('../env');
    expect(() => envModule.getGoogleCalendarWebhookConfig()).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_CALENDAR_CONFIG_MISSING', status: 500 }),
    );
  });

  it('aceita URL publica diferente em desenvolvimento', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GOOGLE_CALENDAR_WEBHOOK_URL', 'https://tunnel.example.test/google/webhook');
    const envModule = await import('../env');
    expect(envModule.getGoogleCalendarWebhookConfig()).toEqual({
      webhookUrl: 'https://tunnel.example.test/google/webhook',
    });
  });

  it('rejeita URL invalida', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_WEBHOOK_URL', 'not-a-url');
    await expect(import('../env')).rejects.toThrow('GOOGLE_CALENDAR_WEBHOOK_URL');
  });

  it('recusa boot de producao sem webhook configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(import('../env')).rejects.toThrow('GOOGLE_CALENDAR_WEBHOOK_URL');
  });
});
