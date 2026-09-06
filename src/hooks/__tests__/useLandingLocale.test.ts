import { describe, it, expect } from 'vitest';
import { LOCALE_COOKIE } from '../../../i18n/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('useLandingLocale contract', () => {
  it('persists corgly_locale not landing-locale', () => {
    const src = readFileSync(resolve(__dirname, '../useLandingLocale.ts'), 'utf8');
    expect(src).toMatch(/corgly_locale/);
    expect(src).not.toMatch(/['"]landing-locale['"]/);
    expect(LOCALE_COOKIE).toBe('corgly_locale');
  });
});
