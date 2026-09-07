// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination';

/**
 * `resolvePostLoginDestination` e um dos DOIS pontos que decidem se o aluno
 * entra no produto (o outro e `completeOnboarding`). Ele e chamado pelo login
 * por senha e pelo callback do magic-link; um bug aqui manda admin para o fluxo
 * de aluno, prende aluno num onboarding ja concluido ou vira open redirect.
 * Nenhum dos tres tinha teste.
 */
describe('resolvePostLoginDestination', () => {
  describe('ADMIN', () => {
    it('sem redirectTo vai para o painel admin', () => {
      expect(
        resolvePostLoginDestination({ role: 'ADMIN', onboardingCompletedAt: null }),
      ).toBe('/admin/dashboard');
    });

    it('preserva um redirectTo legitimo sob /admin, com querystring', () => {
      expect(
        resolvePostLoginDestination(
          { role: 'ADMIN', onboardingCompletedAt: null },
          '/admin/students?page=2',
        ),
      ).toBe('/admin/students?page=2');
    });

    it('nunca passa pelo onboarding, mesmo sem onboardingCompletedAt', () => {
      expect(
        resolvePostLoginDestination({ role: 'ADMIN', onboardingCompletedAt: undefined }),
      ).not.toBe('/auth/onboarding');
    });

    it.each([
      ['//evil.com', 'protocol-relative'],
      ['https://evil.com/admin/dashboard', 'origem externa'],
      ['/\\evil.com', 'barra invertida'],
      ['/dashboard', 'fora de /admin'],
      ['/admin', 'exatamente /admin'],
      ['', 'string vazia'],
    ])('rejeita redirectTo %s (%s) e cai no padrao', (candidate) => {
      expect(
        resolvePostLoginDestination({ role: 'ADMIN', onboardingCompletedAt: null }, candidate),
      ).toBe('/admin/dashboard');
    });

    it('rejeita redirectTo nulo', () => {
      expect(
        resolvePostLoginDestination({ role: 'ADMIN', onboardingCompletedAt: null }, null),
      ).toBe('/admin/dashboard');
    });
  });

  describe('STUDENT', () => {
    it('sem onboarding concluido (null) vai para o onboarding', () => {
      expect(
        resolvePostLoginDestination({ role: 'STUDENT', onboardingCompletedAt: null }),
      ).toBe('/auth/onboarding');
    });

    it('sem onboarding concluido (undefined) vai para o onboarding', () => {
      expect(
        resolvePostLoginDestination({ role: 'STUDENT', onboardingCompletedAt: undefined }),
      ).toBe('/auth/onboarding');
    });

    it('com onboarding concluido (Date) vai para o dashboard', () => {
      expect(
        resolvePostLoginDestination({
          role: 'STUDENT',
          onboardingCompletedAt: new Date('2026-01-10T12:00:00.000Z'),
        }),
      ).toBe('/dashboard');
    });

    it('com onboarding concluido (string ISO, como chega serializado) vai para o dashboard', () => {
      expect(
        resolvePostLoginDestination({
          role: 'STUDENT',
          onboardingCompletedAt: '2026-01-10T12:00:00.000Z',
        }),
      ).toBe('/dashboard');
    });

    it('ignora redirectTo: o parametro so vale para ADMIN', () => {
      expect(
        resolvePostLoginDestination(
          { role: 'STUDENT', onboardingCompletedAt: new Date() },
          '/admin/students',
        ),
      ).toBe('/dashboard');
    });
  });

  it('papel desconhecido cai na trilha de aluno (nunca no painel admin)', () => {
    expect(
      resolvePostLoginDestination({ role: 'TEACHER', onboardingCompletedAt: null }),
    ).toBe('/auth/onboarding');
    expect(
      resolvePostLoginDestination({ role: 'TEACHER', onboardingCompletedAt: new Date() }),
    ).toBe('/dashboard');
  });
});
