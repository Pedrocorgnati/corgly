import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('retorna classe simples', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('concatena múltiplas classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('resolve conflito Tailwind — última classe vence', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('conflito de padding', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('classes condicionais — truthy incluído', () => {
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('classes condicionais — falsy excluído', () => {
    expect(cn('base', false && 'hidden')).toBe('base');
  });

  it('objeto com chaves condicionais', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('array de classes', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('undefined e null são ignorados', () => {
    expect(cn('valid', undefined, null, 'also-valid')).toBe('valid also-valid');
  });

  it('string vazia é ignorada', () => {
    expect(cn('', 'foo', '')).toBe('foo');
  });

  it('sem argumentos retorna string vazia', () => {
    expect(cn()).toBe('');
  });
});
