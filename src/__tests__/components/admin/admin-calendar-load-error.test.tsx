/**
 * Item 014 - erro de carregamento na agenda do professor.
 *
 * `AdminCalendar` desestruturava seis campos de `calendar ?? internal` e
 * `error` nao estava na lista. Como `useAdminSchedule` zera os slots quando a
 * busca falha, a tela mostrava "Nenhum slot neste dia." - lista vazia e
 * indistinguivel de dia sem horario para quem consome. A fronteira de erro da
 * rota tambem nunca disparava: o `catch` era cego e, mesmo sem ele, o `throw`
 * nasceria dentro da promise do `useEffect`, fora do ciclo de render.
 *
 * O que estes testes travam, uma classe por destino:
 *
 *  1. falha ESPERADA (`{ error }` da server action) vira erro inline e derruba
 *     a grade, de modo que nem da para selecionar um dia;
 *  2. o retry re-busca e volta ao caminho feliz sem recarregar a rota;
 *  3. erro que chega com um dia JA selecionado apaga o painel de detalhes -
 *     este e o caso que de fato exercita o guard `!error` do ST002, e ele
 *     carrega um controle positivo (painel presente no caminho feliz) para
 *     que o assert de ausencia nao passe por construcao;
 *  4. falha INESPERADA (excecao) sobe para a error boundary da rota.
 *
 * A boundary aqui e local ao arquivo: `src/app/(admin)/admin/schedule/error.tsx`
 * depende do roteador do Next para ser montado. A boundary local prova o mesmo
 * contrato, que e o hook relancar DURANTE O RENDER.
 */
import { Component, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  getAdminAvailability: vi.fn(),
  getAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAdminAvailability: mocks.getAdminAvailability,
  getAvailability: mocks.getAvailability,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AdminScheduleClient } from '@/app/(admin)/admin/schedule/schedule-client';

/** Um dia futuro DENTRO do mes corrente: o hook abre no mes de hoje. */
function diaAlvo(): string {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(hoje.getDate() + 3, ultimoDia);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const DATA = diaAlvo();

const SLOT_LIVRE = {
  id: 'slot-livre',
  startAt: `${DATA}T13:00:00.000Z`,
  endAt: `${DATA}T14:00:00.000Z`,
  isBlocked: false,
  session: null,
};

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
  const tela = <AdminScheduleClient />;
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      {comBoundary ? <BoundaryLocal>{tela}</BoundaryLocal> : tela}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // O React loga o erro capturado pela boundary; o ruido poluiria a suite.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getAvailability.mockResolvedValue({ data: [], error: null });
});

describe('AdminScheduleClient - falha de carregamento da agenda', () => {
  it('falha esperada vira erro inline e nao afirma dia vazio', async () => {
    mocks.getAdminAvailability.mockResolvedValue({ data: null, error: 'Falha ao carregar a agenda' });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('calendar-view-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Falha ao carregar a agenda')).toBeInTheDocument();
    // Aqui nenhum dia foi selecionado, entao afirmar a ausencia do painel de
    // detalhes seria vacuo (`selectedDate` nulo ja o esconde). O que este caso
    // trava e a barreira ANTERIOR: sem grade, o usuario nem chega a selecionar
    // um dia. O guard `!error` com dia selecionado tem caso proprio abaixo.
    expect(screen.queryByTestId('calendar-view-grid')).not.toBeInTheDocument();
  });

  it('o retry re-busca e volta ao caminho feliz sem recarregar a rota', async () => {
    mocks.getAdminAvailability
      .mockResolvedValueOnce({ data: null, error: 'Falha ao carregar a agenda' })
      .mockResolvedValueOnce({ data: [SLOT_LIVRE], error: null });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('calendar-view-error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('calendar-view-error-retry-button'));

    await waitFor(() => {
      expect(screen.getByTestId('calendar-view-grid')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('calendar-view-error')).not.toBeInTheDocument();
    expect(mocks.getAdminAvailability).toHaveBeenCalledTimes(2);
  });

  it('erro que chega com um dia ja selecionado nao vira "Nenhum slot neste dia."', async () => {
    mocks.getAdminAvailability
      .mockResolvedValueOnce({ data: [SLOT_LIVRE], error: null })
      .mockResolvedValueOnce({ data: null, error: 'Falha ao carregar a agenda' });

    renderizar();

    await waitFor(() => {
      expect(screen.getByTestId('calendar-view-grid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`calendar-view-day-${DATA}`));

    // Controle positivo: com o dia selecionado e a busca OK, o painel de
    // detalhes EXISTE nesta montagem. Sem esta linha, o assert de ausencia
    // logo abaixo passaria por construcao e nao provaria nada.
    expect(screen.getByTestId('admin-calendar-day-details')).toBeInTheDocument();
    expect(screen.getByTestId('admin-calendar-slot-list')).toBeInTheDocument();

    // Troca de mes = nova busca, que falha. `selectedDate` NAO e resetado, entao
    // sem o guard `!error` o painel voltaria com "Nenhum slot neste dia." por
    // cima de uma falha de carregamento - exatamente o falso negativo do item.
    fireEvent.click(screen.getByTestId('calendar-view-next-month-button'));

    await waitFor(() => {
      expect(screen.getByTestId('calendar-view-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-calendar-day-details')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-calendar-day-empty')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum slot neste dia.')).not.toBeInTheDocument();
    expect(mocks.getAdminAvailability).toHaveBeenCalledTimes(2);
  });

  it('falha inesperada sobe para a fronteira de erro da rota', async () => {
    mocks.getAdminAvailability.mockRejectedValue(new Error('conexao caiu'));

    renderizar({ comBoundary: true });

    await waitFor(() => {
      expect(screen.getByTestId('boundary-local-fallback')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('calendar-view-error')).not.toBeInTheDocument();
  });
});
