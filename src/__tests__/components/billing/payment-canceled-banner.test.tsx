import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PaymentCanceledBanner } from '@/components/student/payment-canceled-banner';
import { UI_TIMING } from '@/lib/constants';

/**
 * Regressao do aviso de checkout cancelado.
 *
 * O defeito que estes testes trancam (Zero Silencio): o banner semeava o estado
 * apenas na montagem (`useState(visible)`), sem acompanhar a prop. A pagina de
 * creditos e um Server Component que recalcula `visible` a partir de
 * `?canceled=true` e o componente NAO remonta quando so a query muda — voltar
 * de um checkout cancelado por navegacao client-side trocava a prop e o aluno
 * nao recebia aviso nenhum. Mesma coisa na segunda visita, depois que o
 * auto-hide ja tinha apagado o banner.
 *
 * Por isso os casos de rerender abaixo sao a defesa de verdade: os de montagem
 * direta passavam mesmo com o bug.
 */

const messages = {
  credits: {
    paymentCanceled: {
      title: 'Pagamento cancelado.',
      message: 'Você pode tentar novamente quando quiser.',
    },
  },
};

function renderBanner(visible: boolean) {
  const view = render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <PaymentCanceledBanner visible={visible} />
    </NextIntlClientProvider>,
  );
  const rerenderWith = (next: boolean) =>
    view.rerender(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <PaymentCanceledBanner visible={next} />
      </NextIntlClientProvider>,
    );
  return { ...view, rerenderWith };
}

const banner = () => screen.queryByTestId('credits-payment-canceled-banner');

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('PaymentCanceledBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checkout nao cancelado nao renderiza nada', () => {
    renderBanner(false);
    expect(banner()).toBeNull();
  });

  it('checkout cancelado anuncia o motivo e o proximo passo', () => {
    renderBanner(true);
    const alert = screen.getByTestId('credits-payment-canceled-banner');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Pagamento cancelado.');
    expect(alert).toHaveTextContent('Você pode tentar novamente quando quiser.');
  });

  it('some sozinho depois da janela de auto-hide, e nao antes', () => {
    renderBanner(true);
    advance(UI_TIMING.BANNER_AUTO_HIDE - 1);
    expect(banner()).not.toBeNull();
    advance(1);
    expect(banner()).toBeNull();
  });

  it('aparece quando a prop vira true SEM remontar (volta do checkout cancelado)', () => {
    const { rerenderWith } = renderBanner(false);
    expect(banner()).toBeNull();

    rerenderWith(true);

    expect(banner()).not.toBeNull();
    expect(screen.getByTestId('credits-payment-canceled-banner')).toHaveTextContent(
      'Pagamento cancelado.',
    );
  });

  it('reaparece no segundo cancelamento, depois do auto-hide ter apagado o primeiro', () => {
    const { rerenderWith } = renderBanner(true);
    advance(UI_TIMING.BANNER_AUTO_HIDE);
    expect(banner()).toBeNull();

    rerenderWith(false);
    rerenderWith(true);

    expect(banner()).not.toBeNull();
  });

  it('some na hora quando a query deixa de trazer o cancelamento', () => {
    const { rerenderWith } = renderBanner(true);
    expect(banner()).not.toBeNull();

    rerenderWith(false);

    expect(banner()).toBeNull();
  });

  it('nao dispara auto-hide fantasma depois de desmontado', () => {
    const { unmount } = renderBanner(true);
    unmount();
    expect(() => advance(UI_TIMING.BANNER_AUTO_HIDE * 2)).not.toThrow();
    expect(banner()).toBeNull();
  });
});
