'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';

/**
 * Unica parte client da tela de estado da conexao Google (item 020):
 * revogacao e mutacao disparada pelo professor; todo o resto do cartao e
 * server-rendered, no idiom das paginas admin do repo.
 *
 * Confirma com o professor, chama `POST /api/v1/google/calendar/revoke` via
 * `apiClient` (que lanca `ApiError` em resposta nao ok) e recarrega o estado
 * via `router.refresh()`. Falha mostra mensagem de erro em linha (Zero
 * Silencio).
 */
export function GoogleCalendarDisconnectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleDisconnect() {
    const confirmado = window.confirm(
      'Desconectar a agenda Google? O painel deixa de enxergar seus horários ocupados até você conectar de novo.',
    );
    if (!confirmado) return;

    setBusy(true);
    setErro(null);
    try {
      await apiClient.post(API.GOOGLE_CALENDAR_REVOKE, {});
      router.refresh();
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível desconectar. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        data-testid="google-connection-disconnect-button"
        variant="outline"
        onClick={handleDisconnect}
        disabled={busy}
      >
        {busy ? 'Desconectando…' : 'Desconectar'}
      </Button>
      {erro && (
        <p data-testid="google-connection-disconnect-error" className="text-sm text-destructive mt-2" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
