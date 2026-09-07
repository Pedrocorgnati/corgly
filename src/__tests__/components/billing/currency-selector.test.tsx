import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CurrencySelector } from '@/components/billing/CurrencySelector';
import type { Currency } from '@/lib/currency';
import type { CurrencyErrorKind } from '@/lib/hooks/use-user-currency';

/**
 * Regressao do seletor de moeda.
 *
 * O componente ficou sem cobertura depois de ser reescrito para CONTROLADO
 * (antes ele mesmo gravava a preferencia, alem do hook — gravacao dupla). O que
 * estes testes trancam:
 *
 *  - Zero Estados Indefinidos: carregando, salvando, erro de carga, erro de
 *    gravacao e ocioso sao renderizaveis e DISTINTOS entre si. "Carregando" e
 *    "salvando" dizem coisas diferentes porque significam coisas diferentes.
 *  - Zero Silencio: falha de carga/gravacao vira `role="alert"` com texto e
 *    botao de retry acionavel — nunca um seletor que so nao muda.
 *  - Controlado de verdade: clique repassa a escolha para o dono do estado e
 *    nao ha clique redundante na moeda ja selecionada.
 *  - Nenhum valor monetario e renderizado aqui: a moeda cobrada so e conhecida
 *    no checkout, entao o componente nao promete preco nenhum (Zero Assumido).
 */

/** Recorte fiel de `credits.currency` do catalogo (i18n/messages/pt-BR.json). */
const messages = {
  credits: {
    currency: {
      label: 'Moeda',
      groupAria: 'Escolher a moeda de exibição dos preços',
      optionAria: 'Exibir preços em {currency}',
      loading: 'Carregando sua preferência de moeda...',
      saving: 'Salvando sua preferência de moeda...',
      loadError:
        'Não foi possível carregar sua preferência de moeda salva. Exibindo em {currency}.',
      saveError:
        'Não foi possível salvar sua preferência de moeda. A escolha vale apenas neste navegador.',
      retry: 'Tentar novamente',
      note: 'A moeda cobrada é confirmada no pagamento.',
      usdcNote: 'USDC disponível conforme suporte do gateway.',
    },
  },
};

interface RenderOptions {
  value?: Currency;
  onChange?: (currency: Currency) => void;
  available?: readonly Currency[];
  isLoading?: boolean;
  isSaving?: boolean;
  error?: CurrencyErrorKind | null;
  onRetry?: () => void;
}

function renderSelector(options: RenderOptions = {}) {
  const onChange = options.onChange ?? vi.fn();
  const view = render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <CurrencySelector
        value={options.value ?? 'USD'}
        onChange={onChange}
        {...(options.available ? { available: options.available } : {})}
        isLoading={options.isLoading ?? false}
        isSaving={options.isSaving ?? false}
        error={options.error ?? null}
        {...(options.onRetry ? { onRetry: options.onRetry } : {})}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onChange };
}

describe('CurrencySelector — selecao controlada', () => {
  it('marca apenas a moeda vigente como pressionada', () => {
    renderSelector({ value: 'BRL' });
    const group = screen.getByTestId('currency-selector');
    const pressed = within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('BRL');
  });

  it('repassa a nova moeda para o dono do estado', () => {
    const { onChange } = renderSelector({ value: 'USD' });
    fireEvent.click(screen.getByTestId('currency-selector-eur-button'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('EUR');
  });

  it('nao dispara gravacao ao clicar na moeda ja selecionada', () => {
    const { onChange } = renderSelector({ value: 'USD' });
    fireEvent.click(screen.getByTestId('currency-selector-usd-button'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('respeita a lista de moedas disponiveis e omite a nota de USDC fora dela', () => {
    renderSelector({ value: 'USD', available: ['USD', 'BRL'] });
    expect(within(screen.getByTestId('currency-selector')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('currency-selector-usdc-button')).toBeNull();
    expect(screen.queryByText(/USDC disponível/)).toBeNull();
    expect(screen.getByText(/A moeda cobrada é confirmada no pagamento/)).toBeInTheDocument();
  });
});

describe('CurrencySelector — estados', () => {
  it('estado ocioso nao exibe nem status nem alerta', () => {
    renderSelector();
    expect(screen.queryByTestId('currency-selector-status')).toBeNull();
    expect(screen.queryByTestId('currency-selector-error')).toBeNull();
    expect(screen.getByTestId('currency-selector')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByTestId('currency-selector-usd-button')).not.toBeDisabled();
  });

  it('carregando: anuncia leitura em voo e bloqueia a troca', () => {
    const { onChange } = renderSelector({ isLoading: true });
    const status = screen.getByTestId('currency-selector-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Carregando sua preferência de moeda...');
    expect(screen.getByTestId('currency-selector')).toHaveAttribute('aria-busy', 'true');
    const button = screen.getByTestId('currency-selector-brl-button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('salvando: fala de gravacao, nao de carga (estados distintos)', () => {
    renderSelector({ isSaving: true });
    const status = screen.getByTestId('currency-selector-status');
    expect(status).toHaveTextContent('Salvando sua preferência de moeda...');
    expect(status).not.toHaveTextContent('Carregando sua preferência de moeda...');
  });

  it('erro de carga: alerta nomeia a moeda exibida e oferece retry acionavel', () => {
    const onRetry = vi.fn();
    renderSelector({ value: 'EUR', error: 'load', onRetry });
    const alert = screen.getByTestId('currency-selector-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Exibindo em EUR.');
    fireEvent.click(screen.getByTestId('currency-selector-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('erro de gravacao: mensagem propria, diferente da de carga', () => {
    renderSelector({ value: 'BRL', error: 'save', onRetry: vi.fn() });
    const alert = screen.getByTestId('currency-selector-error');
    expect(alert).toHaveTextContent(/A escolha vale apenas neste navegador/);
    expect(alert).not.toHaveTextContent(/Exibindo em/);
  });

  it('erro sem handler de retry nao renderiza botao morto', () => {
    renderSelector({ error: 'save' });
    expect(screen.getByTestId('currency-selector-error')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-selector-retry-button')).toBeNull();
  });

  it('nao renderiza valor monetario: moeda de cobranca so e conhecida no checkout', () => {
    const { container } = renderSelector({ value: 'BRL' });
    expect(container.textContent ?? '').not.toMatch(/\d+[.,]\d{2}/);
  });
});
