import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CreditBalanceSummary } from '@/components/student/credit-balance-summary';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Estados do saldo na vitrine de creditos (`/credits`).
 *
 * O defeito trancado aqui: a pagina lia saldo e lotes num `try/catch` que, na
 * falha, devolvia lista vazia. O aluno com credito via a tela de quem nao tem —
 * e nao havia diferenca visivel entre "voce tem zero" e "nao consegui ler".
 *
 * Sao TRES estados distintos e visiveis, provados pelo `data-state`:
 *   ok    -> o numero;
 *   empty -> o zero MAIS a explicacao de que nao da para agendar sem credito;
 *   error -> aviso explicito e um botao que refaz a busca no servidor.
 *
 * As mensagens sao as REAIS de `i18n/messages/pt-BR.json`: dicionario
 * improvisado esconderia regressao de i18n.
 */

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function renderSummary(state: Parameters<typeof CreditBalanceSummary>[0]['state']) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <CreditBalanceSummary state={state} />
    </NextIntlClientProvider>,
  );
}

describe('CreditBalanceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sucesso: mostra o saldo e nao anuncia vazio nem erro', () => {
    renderSummary({ status: 'ok', balance: 7 });

    const box = screen.getByTestId('credits-balance');
    expect(box).toHaveAttribute('data-state', 'ok');
    expect(screen.getByTestId('credits-balance-value')).toHaveTextContent('7');
    expect(screen.getByText('Saldo total')).toBeInTheDocument();
    expect(screen.queryByTestId('credits-balance-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('credits-balance-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('credits-balance-retry-button')).not.toBeInTheDocument();
  });

  it('vazio: o zero vem acompanhado da explicacao, nao sozinho', () => {
    renderSummary({ status: 'ok', balance: 0 });

    expect(screen.getByTestId('credits-balance')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByTestId('credits-balance-value')).toHaveTextContent('0');
    expect(screen.getByTestId('credits-balance-empty')).toBeInTheDocument();
    expect(screen.getByText('Sem créditos disponíveis')).toBeInTheDocument();
    expect(screen.getByText('Compre créditos para agendar suas aulas.')).toBeInTheDocument();
    expect(screen.queryByTestId('credits-balance-error')).not.toBeInTheDocument();
  });

  it('erro: nao imprime numero nenhum e avisa em voz alta', () => {
    renderSummary({ status: 'error' });

    const box = screen.getByTestId('credits-balance');
    expect(box).toHaveAttribute('data-state', 'error');
    expect(box).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('credits-balance-error')).toHaveTextContent(
      'Erro inesperado. Tente novamente.',
    );
    // O ponto do defeito: erro NAO pode ser confundido com saldo zero.
    expect(screen.queryByTestId('credits-balance-value')).not.toBeInTheDocument();
    expect(screen.queryByTestId('credits-balance-empty')).not.toBeInTheDocument();
  });

  it('erro: o botao de repetir refaz a busca no servidor', () => {
    renderSummary({ status: 'error' });

    const retry = screen.getByTestId('credits-balance-retry-button');
    expect(retry).toHaveTextContent('Tentar novamente');
    expect(retry).toBeEnabled();

    fireEvent.click(retry);

    // `router.refresh()` reexecuta o Server Component que le o saldo — o retry
    // busca de novo de verdade, nao apenas esconde o aviso.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('o alvo de toque do retry respeita o minimo do projeto', () => {
    renderSummary({ status: 'error' });

    expect(screen.getByTestId('credits-balance-retry-button').className).toContain('min-h-[44px]');
  });
});
