// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_REDIRECT,
  sanitizeAdminRedirectTo,
  withRedirectTo,
} from './safe-redirect';

const CTRL = String.fromCharCode(1);
const NL = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);

describe('sanitizeAdminRedirectTo', () => {
  it('aceita paths sob /admin e preserva a query', () => {
    expect(sanitizeAdminRedirectTo('/admin/dashboard')).toBe('/admin/dashboard');
    expect(sanitizeAdminRedirectTo('/admin/students/abc?tab=notes')).toBe(
      '/admin/students/abc?tab=notes',
    );
  });

  it('normaliza segmentos relativos que ficam sob /admin', () => {
    expect(sanitizeAdminRedirectTo('/admin/students/../dashboard')).toBe('/admin/dashboard');
  });

  it('descarta o fragmento (hash)', () => {
    expect(sanitizeAdminRedirectTo('/admin/dashboard#x')).toBe('/admin/dashboard');
  });

  it.each<[unknown, string]>([
    [null, 'null'],
    [undefined, 'undefined'],
    [42, 'numero'],
    ['', 'vazio'],
    ['admin/dashboard', 'sem barra inicial'],
    ['//evil.com', 'protocol-relative'],
    ['/' + BACKSLASH + 'evil.com', 'barra invertida'],
    ['https://evil.com', 'URL absoluta'],
    ['javascript:alert(1)', 'esquema javascript'],
    ['/admin/../..//evil.com', 'escapa via ..'],
    ['/dashboard', 'fora de /admin'],
    ['/administrator', 'prefixo parecido'],
    ['/admin', 'raiz /admin (sem pagina)'],
    ['/admin/dashboard' + CTRL, 'caractere de controle'],
    ['/admin/dashboard' + NL, 'quebra de linha'],
  ])('rejeita %j (%s) e devolve o default', (input) => {
    expect(sanitizeAdminRedirectTo(input)).toBe(DEFAULT_ADMIN_REDIRECT);
  });

  it('default e o dashboard admin', () => {
    expect(DEFAULT_ADMIN_REDIRECT).toBe('/admin/dashboard');
  });
});

describe('withRedirectTo', () => {
  it('codifica o destino com URLSearchParams', () => {
    expect(withRedirectTo('/auth/login', '/admin/students/abc?tab=notes')).toBe(
      '/auth/login?redirectTo=%2Fadmin%2Fstudents%2Fabc%3Ftab%3Dnotes',
    );
  });
});
