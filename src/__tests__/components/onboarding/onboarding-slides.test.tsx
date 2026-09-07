import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingSlides } from '@/components/onboarding/onboarding-slides';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Este teste renderizava com um objeto `messages` escrito a mao. Isso criava um
 * segundo catalogo: o componente pedia `onboarding.completing` e
 * `onboarding.later`, o fixture nao publicava, o next-intl devolvia o caminho
 * cru como texto e o teste continuava verde — o defeito registrado em
 * `message-fixtures.test.ts` (`DIVIDA_DE_FIXTURE`). Agora ele renderiza com o
 * catalogo real de pt-BR, entao toda copy afirmada aqui e a copy que o usuario
 * le, e a divida saiu do registro.
 */
const t = ptBR.onboarding;

const defaultProps = {
  onComplete: vi.fn(),
  onSkip: vi.fn(),
};

function renderWithI18n(props: Partial<React.ComponentProps<typeof OnboardingSlides>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <OnboardingSlides {...defaultProps} {...props} />
    </NextIntlClientProvider>
  );
}

/** Avanca ate o ultimo slide pelo botao real de navegacao. */
async function irAteOUltimoSlide(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('onboarding-next-button')); // slide 2
  await user.click(screen.getByTestId('onboarding-next-button')); // slide 3
  await user.click(screen.getByTestId('onboarding-next-button')); // slide 4
}

describe('OnboardingSlides', () => {
  it('renderiza primeiro slide por padrao com a copy do catalogo real', () => {
    renderWithI18n();

    expect(screen.getByText(t.slide1.title)).toBeInTheDocument();
    expect(screen.getByText(t.slide1.description)).toBeInTheDocument();
  });

  it('mostra botoes de navegacao com os rotulos do catalogo real', () => {
    renderWithI18n();

    expect(screen.getByTestId('onboarding-prev-button')).toHaveTextContent(t.prev);
    expect(screen.getByTestId('onboarding-next-button')).toHaveTextContent(t.next);
    expect(screen.getByTestId('onboarding-skip-button')).toHaveTextContent(t.skip);
  });

  it('botao Anterior esta desabilitado no primeiro slide', () => {
    renderWithI18n();

    expect(screen.getByTestId('onboarding-prev-button')).toBeDisabled();
  });

  it('navega para segundo slide ao clicar Proximo', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('onboarding-next-button'));

    expect(screen.getByText(t.slide2.title)).toBeInTheDocument();
  });

  it('navega de volta ao clicar Anterior', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('onboarding-next-button'));
    expect(screen.getByText(t.slide2.title)).toBeInTheDocument();

    await user.click(screen.getByTestId('onboarding-prev-button'));
    expect(screen.getByText(t.slide1.title)).toBeInTheDocument();
  });

  it('navega ate o ultimo slide', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await irAteOUltimoSlide(user);

    expect(screen.getByText(t.slide4.title)).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-slide-cta-button')).toHaveTextContent(t.slide4.cta);
  });

  it('botao Proximo desaparece no ultimo slide e da lugar a "Depois"', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await irAteOUltimoSlide(user);

    expect(screen.queryByTestId('onboarding-next-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('onboarding-later-button')).toHaveTextContent(t.later);
  });

  it('chama onComplete ao clicar CTA no ultimo slide', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWithI18n({ onComplete });

    await irAteOUltimoSlide(user);
    await user.click(screen.getByTestId('onboarding-slide-cta-button'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('chama onSkip ao clicar Pular', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    renderWithI18n({ onSkip });

    await user.click(screen.getByTestId('onboarding-skip-button'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('isCompleting trava as acoes e mostra o rotulo de conclusao em voo', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithI18n();

    await irAteOUltimoSlide(user);

    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <OnboardingSlides {...defaultProps} isCompleting />
      </NextIntlClientProvider>
    );

    expect(screen.getByTestId('onboarding-slide-cta-button')).toHaveTextContent(t.completing);
    expect(screen.getByTestId('onboarding-slide-cta-button')).toBeDisabled();
    expect(screen.getByTestId('onboarding-later-button')).toHaveTextContent(t.completing);
    expect(screen.getByTestId('onboarding-later-button')).toBeDisabled();
    expect(screen.getByTestId('onboarding-skip-button')).toBeDisabled();
  });

  it('errorMessage aparece como alerta visivel', () => {
    renderWithI18n({ errorMessage: ptBR.onboarding.complete_error });

    const alerta = screen.getByTestId('onboarding-error');
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveTextContent(ptBR.onboarding.complete_error);
  });

  it('navega com ArrowRight (teclado)', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByText(t.slide2.title)).toBeInTheDocument();
  });

  it('navega com ArrowLeft (teclado)', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(t.slide2.title)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(t.slide1.title)).toBeInTheDocument();
  });

  it('ArrowLeft no primeiro slide nao quebra', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(screen.getByText(t.slide1.title)).toBeInTheDocument();
  });

  it('ArrowRight no ultimo slide nao quebra', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 2
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 3
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 4
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // continua no 4

    expect(screen.getByText(t.slide4.title)).toBeInTheDocument();
  });

  it('renderiza progress dots como tabs', () => {
    renderWithI18n();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('clicar em dot navega diretamente para o slide', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('onboarding-progress-dot-2-button'));

    expect(screen.getByText(t.slide3.title)).toBeInTheDocument();
  });

  it('slide 2 renderiza os 5 pilares do catalogo real', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('onboarding-next-button'));

    const lista = screen.getByTestId('onboarding-slide-pillars-list');
    for (const pilar of t.slide2.pillars) {
      expect(within(lista).getByText(pilar)).toBeInTheDocument();
    }
  });

  it('slide 3 renderiza os 4 passos do ciclo do catalogo real', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('onboarding-next-button'));
    await user.click(screen.getByTestId('onboarding-next-button'));

    const lista = screen.getByTestId('onboarding-slide-cycle-list');
    for (const passo of t.slide3.steps) {
      expect(within(lista).getByText(passo)).toBeInTheDocument();
    }
  });

  it('slide 4 mostra preco com desconto e preco original riscado', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await irAteOUltimoSlide(user);

    const preco = screen.getByTestId('onboarding-slide-cta-price');
    expect(within(preco).getByText(t.slide4.price)).toBeInTheDocument();
    expect(within(preco).getByText(t.slide4.original_price)).toHaveClass('line-through');
  });
});
