import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button-variants';
import { API } from '@/lib/constants/routes';
import type { GoogleCalendarStatusDto } from '@/app/(admin)/admin/google-calendar/google-calendar-status.contract';

import { GoogleCalendarDisconnectButton } from './GoogleCalendarDisconnectButton';

interface GoogleCalendarConnectionProps {
  status: GoogleCalendarStatusDto;
  /** Fuso IANA canonico da agenda, resolvido no servidor por `getCanonicalTimezone`. */
  timezone: string;
}

/**
 * Carimbo formatado no fuso CANONICO da agenda (resolvido no servidor), nunca
 * `toLocaleString` solto no fuso do navegador — o professor precisa ler as
 * datas no mesmo fuso em que a agenda opera.
 */
function formatCarimbo(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** Carimbo da ultima sincronizacao: sempre presente, nunca vazio nem traco mudo. */
function UltimaSincronizacao({ valor, timezone }: { valor: string | null; timezone: string }) {
  return (
    <p data-testid="google-connection-last-sync" className="text-sm text-muted-foreground">
      Última sincronização concluída:{' '}
      {valor ? formatCarimbo(valor, timezone) : 'Nenhuma sincronizacao concluida ainda'}
    </p>
  );
}

/**
 * Cartao de estado da conexao com a agenda Google (loop 09-06, item 020).
 *
 * Trata os quatro elementos da enumeracao do source: `disconnected`,
 * `connected`, `expired` e o carimbo da ultima sincronizacao bem sucedida
 * (que acompanha `connected` e `expired`, com texto explicito quando `null`).
 *
 * A acao "Conectar" e ancora de navegacao, NUNCA fetch: a rota `connect` do
 * item 019 e GET que responde 307 para o consentimento do Google.
 */
export function GoogleCalendarConnection({ status, timezone }: GoogleCalendarConnectionProps) {
  return (
    <div
      data-testid="google-connection-card"
      className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4"
    >
      {status.state === 'disconnected' && (
        <>
          <h2 className="font-semibold text-foreground">Agenda Google não conectada</h2>
          <p className="text-sm text-muted-foreground">
            Conecte sua agenda Google para que seus horários ocupados apareçam bloqueados no painel.
          </p>
          <a
            data-testid="google-connection-connect-button"
            href={API.GOOGLE_CALENDAR_CONNECT}
            className={cn(buttonVariants(), 'inline-flex')}
          >
            Conectar agenda Google
          </a>
        </>
      )}

      {status.state === 'connected' && (
        <>
          <h2 className="font-semibold text-foreground">Agenda Google conectada</h2>
          <p className="text-sm text-muted-foreground">
            Conectada em {status.connectedAt ? formatCarimbo(status.connectedAt, timezone) : ''}
          </p>
          <UltimaSincronizacao valor={status.lastSuccessfulSyncAt} timezone={timezone} />
          <GoogleCalendarDisconnectButton />
        </>
      )}

      {status.state === 'expired' && (
        <>
          <h2 className="font-semibold text-foreground">Conexão com a agenda Google expirada</h2>
          <p className="text-sm text-muted-foreground">
            A conexão original foi feita em{' '}
            {status.connectedAt ? formatCarimbo(status.connectedAt, timezone) : ''}, mas o Google
            não a reconhece mais. Reconecte para voltar a bloquear seus horários ocupados.
          </p>
          <UltimaSincronizacao valor={status.lastSuccessfulSyncAt} timezone={timezone} />
          <a
            data-testid="google-connection-connect-button"
            href={API.GOOGLE_CALENDAR_CONNECT}
            className={cn(buttonVariants(), 'inline-flex')}
          >
            Reconectar agenda Google
          </a>
        </>
      )}
    </div>
  );
}
