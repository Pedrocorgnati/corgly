// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminMfaBypassed } from './mfa-bypass';

describe('isAdminMfaBypassed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['development', 'true', true],
    ['development', 'false', false],
    ['development', undefined, false],
    ['development', 'TRUE', false],
    ['development', '1', false],
    ['production', 'true', false],
    ['test', 'true', false],
    [undefined, 'true', false],
  ] as const)(
    'NODE_ENV=%s ADMIN_MFA_DEV_BYPASS=%s -> %s',
    (nodeEnv, flag, expected) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = { NODE_ENV: nodeEnv, ADMIN_MFA_DEV_BYPASS: flag } as NodeJS.ProcessEnv;
      expect(isAdminMfaBypassed(env)).toBe(expected);
    },
  );

  it('avisa no console uma unica vez por carga do modulo quando ativo', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isAdminMfaBypassed: fresh } = await import('./mfa-bypass');
    const env = { NODE_ENV: 'development', ADMIN_MFA_DEV_BYPASS: 'true' } as NodeJS.ProcessEnv;

    expect(fresh(env)).toBe(true);
    expect(fresh(env)).toBe(true);
    expect(fresh(env)).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ADMIN_MFA_DEV_BYPASS');
  });

  it('nao avisa quando o bypass esta desligado', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isAdminMfaBypassed: fresh } = await import('./mfa-bypass');

    expect(fresh({ NODE_ENV: 'production', ADMIN_MFA_DEV_BYPASS: 'true' } as NodeJS.ProcessEnv)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
