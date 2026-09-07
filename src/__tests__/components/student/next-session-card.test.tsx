import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { NextSessionCard, type NextSessionView } from '@/components/student/next-session-card';

/**
 * Regressao do card "Proxima aula".
 *
 * Os quatro defeitos que estes testes trancam:
 *  1. "Cancelar" navegava para `/schedule?cancel=<id>` — parametro que nenhuma
 *     tela le. Agora abre o dialogo real de cancelamento.
 *  2. A janela de "Entrar" era congelada no render do servidor. Agora e medida
 *     no cliente e a aula EM ANDAMENTO continua acionavel.
 *  3. Falha de leitura e agenda vazia eram o mesmo estado vazio.
 *  4. Data ilegivel imprimia "NaN:NaN:NaN".
 */

const refresh = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const cancelSession = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/actions/sessions', () => ({
  cancelSession: (...args: unknown[]) => cancelSession(...(args as [])),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** Recorte das chaves consumidas pelo card (fragmento i18n `fx-5.json`). */
const messages = {
  dashboard: {
    nextSession: {
      error: {
        title: 'Não conseguimos carregar sua próxima aula',
        description: 'Isso não quer dizer que você está sem aulas marcadas.',
        retry: 'Tentar de novo',
        retrying: 'Carregando...',
        viewHistory: 'Ver histórico',
      },
      ended: {
        clock: 'Aula encerrada',
        hint: 'Esta aula terminou. Atualize para ver a próxima.',
        refresh: 'Atualizar',
        refreshing: 'Atualizando...',
        viewHistory: 'Ver histórico',
      },
    },
  },
};

function renderCard(props: { session: NextSessionView | null; loadError?: string | null }) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <NextSessionCard session={props.session} loadError={props.loadError ?? null} />
    </NextIntlClientProvider>,
  );
}

/** Sessao com inicio/fim relativos a AGORA, em minutos. */
function sessionAt(startMin: number, endMin: number): NextSessionView {
  const start = new Date(Date.now() + startMin * 60_000);
  const end = new Date(Date.now() + endMin * 60_000);
  return {
    sessionId: 'ses_1',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'SCHEDULED',
    date: 'segunda-feira, 08 de setembro',
    time: '14:00',
  };
}

describe('NextSessionCard', () => {
  beforeEach(() => {
    refresh.mockClear();
    push.mockClear();
    cancelSession.mockClear();
  });

  describe('aula futura', () => {
    it('conta o tempo restante e mantem a sala fechada fora da janela', () => {
      renderCard({ session: sessionAt(120, 175) });

      // Duas horas viram "01:59:xx" — nunca "NaN" e nunca "--:--:--" apos o tick.
      const countdown = screen.getByTestId('dashboard-next-session-countdown');
      expect(countdown.textContent).toMatch(/^0[01]:\d{2}:\d{2}$/);
      expect(screen.getByText('até a aula')).toBeInTheDocument();

      // A sala so abre 5 min antes (src/lib/session/canEnter.ts): o botao
      // existe, mas nao e um link.
      const enter = screen.getByTestId('dashboard-next-session-enter-button');
      expect(enter.tagName).toBe('SPAN');
      expect(enter).toHaveAttribute('aria-disabled', 'true');
    });

    it('libera a entrada na janela canonica que antecede a aula', () => {
      renderCard({ session: sessionAt(4, 59) });

      const enter = screen.getByTestId('dashboard-next-session-enter-button');
      expect(enter.tagName).toBe('A');
      expect(enter).toHaveAttribute('href', '/session/ses_1/lobby');
    });
  });

  describe('aula em andamento', () => {
    it('continua visivel e acionavel depois do horario de inicio', () => {
      renderCard({ session: { ...sessionAt(-10, 45), status: 'IN_PROGRESS' } });

      expect(screen.getByTestId('dashboard-kpi-next-session')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-next-session-countdown')).toHaveTextContent(
        'Sessão ao vivo!',
      );

      const enter = screen.getByTestId('dashboard-next-session-enter-button');
      expect(enter.tagName).toBe('A');
      expect(enter).toHaveAttribute('href', '/session/ses_1/lobby');
    });

    it('troca para o estado encerrado quando o fim ja passou', () => {
      renderCard({ session: sessionAt(-120, -60) });

      expect(screen.getByTestId('dashboard-next-session-countdown')).toHaveTextContent(
        'Aula encerrada',
      );
      expect(screen.queryByTestId('dashboard-next-session-enter-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard-next-session-refresh-button')).toBeInTheDocument();
    });
  });

  describe('agenda vazia', () => {
    it('diz que nao ha aula e oferece agendar', () => {
      renderCard({ session: null });

      expect(screen.getByTestId('dashboard-next-session-empty')).toBeInTheDocument();
      expect(screen.getByText('Nenhuma aula agendada')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-next-session-schedule-button')).toHaveAttribute(
        'href',
        '/schedule',
      );
      // Estado vazio NAO pode ser confundido com falha.
      expect(screen.queryByTestId('dashboard-next-session-error')).not.toBeInTheDocument();
    });
  });

  describe('falha de leitura', () => {
    it('nao vira "nenhuma aula agendada" e oferece recarregar', () => {
      renderCard({ session: null, loadError: 'Erro 500' });

      const erro = screen.getByTestId('dashboard-next-session-error');
      expect(erro).toBeInTheDocument();
      expect(erro).toHaveTextContent('Não conseguimos carregar sua próxima aula');
      expect(erro).toHaveTextContent('Erro 500');
      expect(screen.queryByTestId('dashboard-next-session-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('Nenhuma aula agendada')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('dashboard-next-session-error-retry-button'));
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a falha tem precedencia sobre uma sessao residual', () => {
      renderCard({ session: sessionAt(30, 85), loadError: 'Erro 500' });

      expect(screen.getByTestId('dashboard-next-session-error')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-next-session-countdown')).not.toBeInTheDocument();
    });
  });

  describe('data invalida', () => {
    it('avisa em vez de imprimir NaN', () => {
      const { container } = renderCard({
        session: {
          sessionId: 'ses_2',
          startAt: 'nao-e-data',
          endAt: 'nao-e-data',
          status: 'SCHEDULED',
          date: null,
          time: null,
        },
      });

      expect(screen.getByTestId('dashboard-next-session-countdown')).toHaveTextContent(
        'Horário indisponível',
      );
      expect(container.textContent).not.toMatch(/NaN/);
      expect(screen.getByText('Data a confirmar')).toBeInTheDocument();
      expect(screen.getByText('Horário a confirmar')).toBeInTheDocument();
    });
  });

  describe('cancelamento', () => {
    it('abre o dialogo real em vez de navegar para um parametro morto', () => {
      renderCard({ session: sessionAt(120, 175) });

      expect(screen.queryByTestId('modal-cancel-session')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('dashboard-next-session-cancel-button'));

      const modal = screen.getByTestId('modal-cancel-session');
      expect(modal).toBeInTheDocument();
      expect(
        within(modal).getByTestId('modal-cancel-session-confirm-button'),
      ).toBeInTheDocument();
      // Zero Orfaos: nada de `router.push('/schedule?cancel=...')`.
      expect(push).not.toHaveBeenCalled();
    });
  });
});
