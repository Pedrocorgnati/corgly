import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarConnection } from '@/components/admin/GoogleCalendarConnection';
import { API } from '@/lib/constants/routes';
import type { GoogleCalendarStatusDto } from '@/app/(admin)/admin/google-calendar/google-calendar-status.contract';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// O subcomponente client de desconectar usa useRouter; sem App Router montado
// no jsdom, o hook lanca. A suite nao exercita a revogacao (coberta pelo teste
// de rota `revoke` do item 019), entao o roteador e um stub inerte.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TIMEZONE = 'America/Sao_Paulo';

function formatEsperado(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TIMEZONE,
  }).format(new Date(iso));
}

function statusDto(overrides: Partial<GoogleCalendarStatusDto>): GoogleCalendarStatusDto {
  return {
    state: 'disconnected',
    connectedAt: null,
    lastSuccessfulSyncAt: null,
    scope: null,
    ...overrides,
  };
}

describe('GoogleCalendarConnection', () => {
  it('disconnected: informa agenda nao conectada e ancora de conectar aponta para a rota connect', () => {
    render(<GoogleCalendarConnection status={statusDto({ state: 'disconnected' })} timezone={TIMEZONE} />);

    expect(screen.getByTestId('google-connection-card')).toBeInTheDocument();
    expect(screen.getByText('Agenda Google não conectada')).toBeInTheDocument();
    expect(screen.getByTestId('google-connection-connect-button')).toHaveAttribute(
      'href',
      API.GOOGLE_CALENDAR_CONNECT,
    );
  });

  it('connected com ultima sincronizacao: estado visivel, carimbo da conexao e carimbo da ultima sync formatados', () => {
    render(
      <GoogleCalendarConnection
        status={statusDto({
          state: 'connected',
          connectedAt: '2026-09-01T12:00:00.000Z',
          lastSuccessfulSyncAt: '2026-09-08T15:30:00.000Z',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        })}
        timezone={TIMEZONE}
      />,
    );

    expect(screen.getByText('Agenda Google conectada')).toBeInTheDocument();
    expect(
      screen.getByText(`Conectada em ${formatEsperado('2026-09-01T12:00:00.000Z')}`),
    ).toBeInTheDocument();
    const lastSync = screen.getByTestId('google-connection-last-sync');
    expect(lastSync).toHaveTextContent(formatEsperado('2026-09-08T15:30:00.000Z'));
    expect(screen.getByTestId('google-connection-disconnect-button')).toBeInTheDocument();
  });

  it('connected sem ultima sincronizacao: texto explicito "Nenhuma sincronizacao concluida ainda"', () => {
    render(
      <GoogleCalendarConnection
        status={statusDto({
          state: 'connected',
          connectedAt: '2026-09-01T12:00:00.000Z',
          lastSuccessfulSyncAt: null,
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        })}
        timezone={TIMEZONE}
      />,
    );

    const lastSync = screen.getByTestId('google-connection-last-sync');
    expect(lastSync).toHaveTextContent('Nenhuma sincronizacao concluida ainda');
  });

  it('expired: estado expirado visivel e orientacao de reconectar ligada a rota connect', () => {
    render(
      <GoogleCalendarConnection
        status={statusDto({
          state: 'expired',
          connectedAt: '2026-09-01T12:00:00.000Z',
          lastSuccessfulSyncAt: null,
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        })}
        timezone={TIMEZONE}
      />,
    );

    expect(screen.getByText('Conexão com a agenda Google expirada')).toBeInTheDocument();
    expect(screen.getByText(/Reconecte para voltar a bloquear/)).toBeInTheDocument();
    expect(screen.getByTestId('google-connection-connect-button')).toHaveAttribute(
      'href',
      API.GOOGLE_CALENDAR_CONNECT,
    );
    expect(
      screen.getByText((_, el) =>
        el?.textContent ===
        `A conexão original foi feita em ${formatEsperado('2026-09-01T12:00:00.000Z')}, mas o Google não a reconhece mais. Reconecte para voltar a bloquear seus horários ocupados.`,
      ),
    ).toBeInTheDocument();
  });
});
