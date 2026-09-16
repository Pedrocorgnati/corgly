import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { GoogleCalendarConnection } from '@/components/admin/GoogleCalendarConnection';
import { GoogleOAuthResultBanner } from '@/components/admin/GoogleOAuthResultBanner';
import { getCanonicalTimezone } from '@/lib/canonical-timezone';

import { fetchGoogleCalendarStatus } from './fetch-google-calendar-status';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Conexão Google',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Tela de estado da conexao com a agenda Google (loop 09-06, item 020).
 *
 * O estado e resolvido no servidor (`fetchGoogleCalendarStatus` chama a API
 * interna encaminhando o cookie de sessao); o fuso dos carimbos vem de
 * `getCanonicalTimezone`, nunca do navegador. Erro de carregamento (incluindo
 * o 502 da verificacao junto ao Google) cai no ramo explicito abaixo, nunca
 * num estado de conexao inventado (Zero Estados Indefinidos).
 *
 * GAP-12: recebe os `searchParams` que o callback do Google devolve no
 * redirect e renderiza o banner de resultado do consentimento
 * (`GoogleOAuthResultBanner`, testid `google-oauth-result-banner`).
 */
export default async function AdminGoogleCalendarPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const [resultado, timezone] = await Promise.all([
    fetchGoogleCalendarStatus(),
    getCanonicalTimezone(),
  ]);

  return (
    <PageWrapper data-testid="page-admin-google-calendar">
      <div data-testid="admin-google-calendar-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Conexão com a agenda Google</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estado da integração que bloqueia seus horários ocupados
        </p>
      </div>

      <div className="mb-4">
        <GoogleOAuthResultBanner
          google={firstParam(searchParams.google)}
          reason={firstParam(searchParams.reason)}
          channel={firstParam(searchParams.channel)}
        />
      </div>

      {resultado.kind === 'error' ? (
        <div
          data-testid="google-connection-fetch-error"
          className="bg-card border border-border rounded-2xl p-6 text-center"
        >
          <p className="text-sm text-destructive">
            Erro ao carregar o estado da conexão: {resultado.message}
          </p>
        </div>
      ) : (
        <GoogleCalendarConnection status={resultado.status} timezone={timezone} />
      )}
    </PageWrapper>
  );
}
