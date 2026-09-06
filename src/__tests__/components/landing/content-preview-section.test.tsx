import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('home does not mount content preview', () => {
  it('page.tsx does not import ContentPreviewSection', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../app/(public)/page.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/ContentPreviewSection/);
    expect(src).not.toMatch(/landing-content-preview/);
  });
});
