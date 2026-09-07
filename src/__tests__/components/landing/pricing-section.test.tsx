import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingSection } from '@/components/landing/pricing-section';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Vitrine publica de precos — TRES planos (SINGLE, PACK_10, MONTHLY 10/20).
 *
 * As mensagens sao as REAIS (`i18n/messages/pt-BR.json`), nunca um dicionario
 * fabricado: dicionario inventado passa mesmo quando a chave sumiu do produto e
 * esconde regressao de i18n.
 *
 * O foco novo destes testes e a PONTE landing -> vitrine. O CTA de cada plano
 * tem TRES estados, um por estado da sondagem de sessao (`useAuth`):
 *   - visitante  -> `/auth/register?intent=first-lesson&plan=...&lessons=...`
 *   - autenticado-> `/credits?plan=...&lessons=...`
 *   - carregando -> ainda e link, apontando para o funil publico, com
 *                   `aria-busy` e o clique adiado ate a sessao responder
 *
 * O estado de carregamento NAO pode virar botao morto: a landing e servida como
 * componente de servidor com `revalidate 3600`, entao sem JavaScript no
 * navegador `isLoading` nunca cai e o CTA ficaria sem saida para sempre.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Estado de sessao mutavel por teste: `vi.hoisted` garante que o objeto existe
// antes da fabrica do mock rodar.
const auth = vi.hoisted(() => ({
  state: { isAuthenticated: false, isLoading: false },
}));

// O clique dado durante a espera e adiado e resolvido por `router.push`.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    role: null,
    isAuthenticated: auth.state.isAuthenticated,
    isLoading: auth.state.isLoading,
    login: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
}));

function renderPricing() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <PricingSection />
    </NextIntlClientProvider>,
  );
}

const SINGLE_CTA = 'landing-pricing-plan-single-cta-button';
const PACK10_CTA = 'landing-pricing-plan-pack-10-cta-button';
const MONTHLY_CTA = 'landing-pricing-plan-monthly-cta-button';

function hrefOf(testId: string): string | null {
  return screen.getByTestId(testId).getAttribute('href');
}

beforeEach(() => {
  auth.state = { isAuthenticated: false, isLoading: false };
  router.push.mockClear();
});

describe('PricingSection', () => {
  it('mostra os tres planos publicados e nenhum card de PACK_5', () => {
    renderPricing();
    expect(screen.getByTestId('landing-pricing-plan-single')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-plan-pack-10')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-plan-monthly')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-pricing-plan-pack-5')).not.toBeInTheDocument();
    expect(screen.queryByText(/pack 5/i)).not.toBeInTheDocument();
  });

  it('publica os precos canonicos em dolar', () => {
    renderPricing();
    // Primeira aula 12,50 (de 25), avulsa 25, pack 10 = 190 (19/aula).
    expect(screen.getAllByText(/US\$ 12,50/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 25/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 190/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 19/).length).toBeGreaterThan(0);
    // Mensal abre em 10 aulas: 170 no total, 17 por aula.
    expect(screen.getAllByText(/US\$ 170/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$ 17/).length).toBeGreaterThan(0);
    expect(screen.getByText('Mais escolhido')).toBeInTheDocument();
  });

  it('visitante nao autenticado leva plano E volume mensal para o cadastro', () => {
    renderPricing();

    expect(hrefOf(SINGLE_CTA)).toBe('/auth/register?intent=first-lesson&plan=SINGLE');
    expect(hrefOf(PACK10_CTA)).toBe('/auth/register?intent=first-lesson&plan=PACK_10');
    // O mensal abre em 10 aulas e o volume viaja junto do plano.
    expect(hrefOf(MONTHLY_CTA)).toBe(
      '/auth/register?intent=first-lesson&plan=MONTHLY&lessons=10',
    );

    // Trocar para 20 aulas muda o volume levado ao cadastro.
    fireEvent.click(screen.getByTestId('landing-pricing-monthly-option-20'));
    expect(hrefOf(MONTHLY_CTA)).toBe(
      '/auth/register?intent=first-lesson&plan=MONTHLY&lessons=20',
    );
  });

  it('aluno autenticado vai direto para a vitrine com o plano escolhido', () => {
    auth.state = { isAuthenticated: true, isLoading: false };
    renderPricing();

    expect(hrefOf(SINGLE_CTA)).toBe('/credits?plan=SINGLE');
    expect(hrefOf(PACK10_CTA)).toBe('/credits?plan=PACK_10');
    expect(hrefOf(MONTHLY_CTA)).toBe('/credits?plan=MONTHLY&lessons=10');

    fireEvent.click(screen.getByTestId('landing-pricing-monthly-option-20'));
    expect(hrefOf(MONTHLY_CTA)).toBe('/credits?plan=MONTHLY&lessons=20');
  });

  it('enquanto a sessao carrega, todo CTA continua sendo link com destino util', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    renderPricing();

    const destinoDeVisitante: Record<string, string> = {
      [SINGLE_CTA]: '/auth/register?intent=first-lesson&plan=SINGLE',
      [PACK10_CTA]: '/auth/register?intent=first-lesson&plan=PACK_10',
      [MONTHLY_CTA]: '/auth/register?intent=first-lesson&plan=MONTHLY&lessons=10',
    };

    for (const [testId, href] of Object.entries(destinoDeVisitante)) {
      const cta = screen.getByTestId(testId);
      // Sem hidratacao o HTML em cache e tudo que o visitante recebe: botao
      // desabilitado seria um CTA morto para sempre.
      expect(cta.tagName).toBe('A');
      expect(cta).toHaveAttribute('href', href);
      expect(cta).toHaveAttribute('aria-busy', 'true');
      expect(cta).toHaveAttribute('data-state', 'loading');
      expect(cta).not.toBeDisabled();
    }

    // O estado de espera e anunciado, nao silencioso.
    expect(screen.getAllByRole('status').length).toBe(3);
  });

  it('clique durante a espera e adiado ate a sessao responder', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    const { rerender } = renderPricing();

    fireEvent.click(screen.getByTestId(PACK10_CTA));
    // Destino ainda desconhecido: seguir o href de visitante mandaria aluno
    // logado para o cadastro.
    expect(router.push).not.toHaveBeenCalled();

    auth.state = { isAuthenticated: true, isLoading: false };
    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <PricingSection />
      </NextIntlClientProvider>,
    );

    expect(router.push).toHaveBeenCalledWith('/credits?plan=PACK_10');
  });

  it('clique com modificador segue o link, sem adiamento', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    renderPricing();

    // Nova aba: o navegador abre sozinho e nao da para adiar, entao o CTA nao
    // pode interceptar esse clique — o href de visitante ja e destino valido.
    // O listener de documento roda DEPOIS do handler do componente (React
    // escuta na raiz da arvore) e serve para duas coisas: registrar se o
    // componente cancelou o evento e impedir o jsdom de tentar navegar.
    const cancelamentos: boolean[] = [];
    document.addEventListener(
      'click',
      (evento) => {
        cancelamentos.push(evento.defaultPrevented);
        evento.preventDefault();
      },
      { once: true },
    );

    fireEvent.click(screen.getByTestId(PACK10_CTA), { metaKey: true });

    expect(cancelamentos).toEqual([false]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('sai do estado de espera assim que a sessao responde', () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    const { rerender } = renderPricing();
    expect(screen.getByTestId(PACK10_CTA)).toHaveAttribute('aria-busy', 'true');

    auth.state = { isAuthenticated: true, isLoading: false };
    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <PricingSection />
      </NextIntlClientProvider>,
    );

    const cta = screen.getByTestId(PACK10_CTA);
    expect(cta.tagName).toBe('A');
    expect(cta.getAttribute('href')).toBe('/credits?plan=PACK_10');
    expect(cta).not.toHaveAttribute('aria-busy');
    expect(cta).toHaveAttribute('data-state', 'ready');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
