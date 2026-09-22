import { describe, it, expect } from 'vitest';
import { LOCALE_COOKIE } from '../../../i18n/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('landing locale mechanism contract', () => {
  const providerSrc = read('../landingLocaleContext.tsx');
  const hookSrc = read('../useLandingLocale.ts');

  it('persists corgly_locale not landing-locale', () => {
    expect(providerSrc).toMatch(/corgly_locale/);
    expect(providerSrc).not.toMatch(/['"]landing-locale['"]/);
    expect(hookSrc).not.toMatch(/['"]landing-locale['"]/);
    expect(LOCALE_COOKIE).toBe('corgly_locale');
  });

  it('never reads or writes the ?locale= URL param', () => {
    // A gravação do parâmetro na URL era a causa do idioma "mudar sozinho":
    // ele grudava no endereço e re-aplicava em todo re-mount.
    expect(providerSrc).not.toMatch(/searchParams\.(get|set)\(['"]locale['"]\)/);
    expect(hookSrc).not.toMatch(/searchParams\.(get|set)\(['"]locale['"]\)/);
    expect(providerSrc).not.toMatch(/searchParams\.(get|set)\(['"]lang['"]\)/);
    expect(hookSrc).not.toMatch(/searchParams\.(get|set)\(['"]lang['"]\)/);
  });

  it('hook is a pure context consumer (single source of truth)', () => {
    expect(hookSrc).toMatch(/useContext\(LandingLocaleContext\)/);
    expect(hookSrc).not.toMatch(/localStorage/);
    expect(hookSrc).not.toMatch(/document\.cookie/);
  });
});
