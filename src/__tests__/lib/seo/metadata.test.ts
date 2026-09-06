import { describe, it, expect } from 'vitest';
import { generateLandingMetadata } from '@/lib/seo/metadata';
import { SITE_URL, resolveSiteUrl } from '@/lib/constants/landing';

describe('landing metadata', () => {
  it('default title is English tutor copy', () => {
    const meta = generateLandingMetadata('en-US');
    expect(String(meta.title)).toMatch(/Brazilian Portuguese Tutor Online/);
    expect(String(meta.description)).toMatch(/US\$ 12\.50/);
  });

  it('SITE_URL is an absolute http(s) URL', () => {
    expect(SITE_URL.startsWith('http')).toBe(true);
  });

  it('rejects localhost when NODE_ENV is production', () => {
    expect(resolveSiteUrl('http://localhost:3000', 'production')).toBe('https://corgly.app');
    expect(resolveSiteUrl('http://127.0.0.1:3000', 'production')).toBe('https://corgly.app');
    expect(resolveSiteUrl('https://corgly.app', 'production')).toBe('https://corgly.app');
  });
});
