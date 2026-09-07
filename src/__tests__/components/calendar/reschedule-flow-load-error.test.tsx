/**
 * Item 014 - erro de carregamento no modal de reagendamento.
 *
 * `RescheduleFlow` repetia o descarte do `AdminCalendar`: desestruturava
 * `useCalendar()` sem `error`. Com a busca quebrada, o `SlotPicker` recebia
 * lista vazia e mostrava "Nenhum horario disponivel neste dia." - a mesma
 * afirmacao falsa de ausencia.
 *
 * O que estes testes travam:
 *
 *  1. falha de CARREGAR aparece em bloco proprio, sem o picker e sem o
 *     `schedule-empty`;
 *  2. o retry re-busca e o picker volta;
 *  3. o usuario consegue sair do modal com a busca quebrada;
 *  4. falha INESPERADA (excecao de `getAvailability`) sobe para a error
 *     boundary da rota em vez de virar erro inline.
 *
 * O assert de `modal-reschedule-error` ausente no caso 1 e o que impede a
 * conflacao com a falha de REAGENDAR, que tem causa e recuperacao diferentes.
 *
 * O caso 4 e o unico ponto da suite que exercita o `catch` de `useCalendar`
 * (o `fatalError` relancado durante o render). O gemeo admin cobre o mesmo
 * contrato para `useAdminSchedule`, que e OUTRO hook: `AdminCalendar` roda o
 * `useCalendar` com `enabled: false` e ele nunca busca nada la. A boundary
 * aqui e local ao arquivo, porque `src/app/(student)/schedule/error.tsx`
 * depende do roteador do Next para montar; o contrato provado e o mesmo.
 */
import { Component, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  rescheduleSession: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAvailability: mocks.getAvailability,
  rescheduleSession: mocks.rescheduleSession,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { RescheduleFlow } from '@/components/calendar/RescheduleFlow';

/** Um dia futuro DENTRO do mes corrente, longe do aviso de reagendamento tardio. */
function diaAlvo(): string {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(hoje.getDate() + 3, ultimoDia);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const DATA = diaAlvo();

const SESSAO = { id: 'sessao-1', startAt: `${DATA}T13:00:00.000Z` };

const SLOT_LIVRE = {
  id: 'slot-livre',
  startAt: `${DATA}T15:00:00.000Z`,
  endAt: `${DATA}T16:00:00.000Z`,
  isBlocked: false,
};

const onOpenChange = vi.fn();
const onRescheduled = vi.fn();

class BoundaryLocal extends Component<{ children: ReactNode }, { caiu: boolean }> {
  state = { caiu: false };

  static getDerivedStateFromError() {
    return { caiu: true };
  }

  componentDidCatch() {
    // Capturado de proposito; o assert e o fallback aparecer.
  }

  render() {
    if (this.state.caiu) return <div data-testid="boundary-local-fallback">fronteira montou</div>;
    return this.props.children;
  }
}

function renderizar({ comBoundary = false } = {}) {
  const tela = (
    <RescheduleFlow
      session={SESSAO}
      open
      onOpenChange={onOpenChange}
      onRescheduled={onRescheduled}
    />
  );
  return render(comBoundary ? <BoundaryLocal>{tela}</BoundaryLocal> : tela);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RescheduleFlow - falha de carregamento dos horarios', () => {
  it('falha esperada vira bloco proprio, sem picker e sem afirmar dia vazio', async () => {
    mocks.getAvailability.mockResolvedValue({ data: null, error: 'Falha ao carregar horarios' });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('modal-reschedule-load-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Falha ao carregar horarios')).toBeInTheDocument();
    expect(screen.queryByTestId('modal-reschedule-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-empty')).not.toBeInTheDocument();
    // Nao conflacao: este e o erro de CARREGAR, nao o de REAGENDAR.
    expect(screen.queryByTestId('modal-reschedule-error')).not.toBeInTheDocument();
  });

  it('o retry re-busca e o picker volta', async () => {
    mocks.getAvailability
      .mockResolvedValueOnce({ data: null, error: 'Falha ao carregar horarios' })
      .mockResolvedValueOnce({ data: [SLOT_LIVRE], error: null });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('modal-reschedule-load-error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('modal-reschedule-load-error-retry-button'));

    await waitFor(() => {
      expect(screen.getByTestId('modal-reschedule-picker')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('modal-reschedule-load-error')).not.toBeInTheDocument();
    expect(mocks.getAvailability).toHaveBeenCalledTimes(2);
  });

  it('o usuario consegue sair do modal com a busca quebrada', async () => {
    mocks.getAvailability.mockResolvedValue({ data: null, error: 'Falha ao carregar horarios' });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('modal-reschedule-load-error')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('modal-reschedule-confirm-button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-reschedule-cancel-button'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('falha inesperada sobe para a fronteira de erro da rota', async () => {
    // O React loga o erro capturado pela boundary; o ruido poluiria a suite.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getAvailability.mockRejectedValue(new Error('conexao caiu'));

    renderizar({ comBoundary: true });

    await waitFor(() => {
      expect(screen.getByTestId('boundary-local-fallback')).toBeInTheDocument();
    });
    // Excecao NAO vira erro inline: o bloco de carregar e exclusivo da falha
    // ESPERADA que a server action devolve em `result.error`.
    expect(screen.queryByTestId('modal-reschedule-load-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modal-reschedule-picker')).not.toBeInTheDocument();
  });
});
