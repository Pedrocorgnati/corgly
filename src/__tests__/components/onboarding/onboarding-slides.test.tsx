import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingSlides } from '@/components/onboarding/onboarding-slides';

const messages = {
  onboarding: {
    progress: 'Slide {current} de {total}',
    prev: 'Anterior',
    next: 'Proximo',
    skip: 'Pular',
    slide1: {
      title: 'Bem-vindo ao Corgly!',
      description: 'Sua jornada comeca aqui.',
    },
    slide2: {
      title: 'O Metodo Corgly',
      description: 'Baseado em 5 pilares.',
      pillars: ['Compromisso', 'Time-boxed', 'Ciclos', 'Contexto', 'Feedback'],
    },
    slide3: {
      title: 'Ciclo de Aprendizado',
      description: 'Como funciona cada ciclo.',
      steps: ['Agende', 'Estude', 'Pratique', 'Revise'],
    },
    slide4: {
      title: 'Sua Primeira Aula',
      description: 'Com desconto especial.',
      price: '$12.50',
      original_price: '$25.00',
      cta: 'Comecar Agora',
    },
  },
};

const defaultProps = {
  onComplete: vi.fn(),
  onSkip: vi.fn(),
};

function renderWithI18n(props = defaultProps) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <OnboardingSlides {...props} />
    </NextIntlClientProvider>
  );
}

describe('OnboardingSlides', () => {
  it('renderiza primeiro slide por padrao', () => {
    renderWithI18n();

    expect(screen.getByText('Bem-vindo ao Corgly!')).toBeInTheDocument();
    expect(screen.getByText('Sua jornada comeca aqui.')).toBeInTheDocument();
  });

  it('mostra botoes de navegacao', () => {
    renderWithI18n();

    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.getByText('Proximo')).toBeInTheDocument();
    expect(screen.getByText('Pular')).toBeInTheDocument();
  });

  it('botao Anterior esta desabilitado no primeiro slide', () => {
    renderWithI18n();

    const prevButton = screen.getByText('Anterior').closest('button');
    expect(prevButton).toBeDisabled();
  });

  it('navega para segundo slide ao clicar Proximo', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Proximo'));

    expect(screen.getByText('O Metodo Corgly')).toBeInTheDocument();
  });

  it('navega de volta ao clicar Anterior', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    // Go to slide 2
    await user.click(screen.getByText('Proximo'));
    expect(screen.getByText('O Metodo Corgly')).toBeInTheDocument();

    // Go back to slide 1
    await user.click(screen.getByText('Anterior'));
    expect(screen.getByText('Bem-vindo ao Corgly!')).toBeInTheDocument();
  });

  it('navega ate o ultimo slide', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Proximo')); // slide 2
    await user.click(screen.getByText('Proximo')); // slide 3
    await user.click(screen.getByText('Proximo')); // slide 4

    expect(screen.getByText('Sua Primeira Aula')).toBeInTheDocument();
    expect(screen.getByText('Comecar Agora')).toBeInTheDocument();
  });

  it('botao Proximo desaparece no ultimo slide', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Proximo')); // slide 2
    await user.click(screen.getByText('Proximo')); // slide 3
    await user.click(screen.getByText('Proximo')); // slide 4

    expect(screen.queryByText('Proximo')).not.toBeInTheDocument();
  });

  it('chama onComplete ao clicar CTA no ultimo slide', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWithI18n({ ...defaultProps, onComplete });

    await user.click(screen.getByText('Proximo')); // slide 2
    await user.click(screen.getByText('Proximo')); // slide 3
    await user.click(screen.getByText('Proximo')); // slide 4

    await user.click(screen.getByText('Comecar Agora'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('chama onSkip ao clicar Pular', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    renderWithI18n({ ...defaultProps, onSkip });

    await user.click(screen.getByText('Pular'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('navega com ArrowRight (teclado)', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByText('O Metodo Corgly')).toBeInTheDocument();
  });

  it('navega com ArrowLeft (teclado)', () => {
    renderWithI18n();

    // Go to slide 2 first
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('O Metodo Corgly')).toBeInTheDocument();

    // Go back
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Bem-vindo ao Corgly!')).toBeInTheDocument();
  });

  it('ArrowLeft no primeiro slide nao quebra', () => {
    renderWithI18n();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    // Should still be on slide 1
    expect(screen.getByText('Bem-vindo ao Corgly!')).toBeInTheDocument();
  });

  it('ArrowRight no ultimo slide nao quebra', () => {
    renderWithI18n();

    // Navigate to last slide
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 2
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 3
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 4
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // still 4

    expect(screen.getByText('Sua Primeira Aula')).toBeInTheDocument();
  });

  it('renderiza progress dots como tabs', () => {
    renderWithI18n();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('clicar em dot navega diretamente para o slide', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    const tabs = screen.getAllByRole('tab');
    await user.click(tabs[2]); // Go to slide 3

    expect(screen.getByText('Ciclo de Aprendizado')).toBeInTheDocument();
  });

  it('slide 2 renderiza todos os 5 pilares', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Proximo'));

    expect(screen.getByText('Compromisso')).toBeInTheDocument();
    expect(screen.getByText('Time-boxed')).toBeInTheDocument();
    expect(screen.getByText('Ciclos')).toBeInTheDocument();
    expect(screen.getByText('Contexto')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });

  it('slide 4 mostra preco original riscado e preco com desconto', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByText('Proximo')); // 2
    await user.click(screen.getByText('Proximo')); // 3
    await user.click(screen.getByText('Proximo')); // 4

    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
  });
});
