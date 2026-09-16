/**
 * Banner do resultado do consentimento OAuth Google (GAP-12).
 *
 * Renderizado pela pagina `admin/google-calendar` a partir dos `searchParams`
 * que o callback do Google devolve no redirect. Sem este banner o professor
 * concluia o consentimento e caia na tela sem qualquer confirmacao de que a
 * conexao foi feita ou de por que falhou (Zero Silencio).
 *
 * Sem estado e sem efeitos: recebe os valores ja resolvidos no servidor.
 */

const KNOWN_REASONS: Record<string, string> = {
  access_denied: 'o consentimento foi recusado.',
  invalid_state: 'a sessao do consentimento expirou. Tente conectar novamente.',
  exchange_failed: 'a troca do codigo de autorizacao falhou. Tente conectar novamente.',
  scope_rejected:
    'os escopos concedidos nao sao os permitidos. A integracao usa somente leitura da agenda.',
  missing_refresh_token:
    'o Google nao devolveu o token de renovacao. Desconecte e conecte novamente.',
};

interface GoogleOAuthResultBannerProps {
  /** Valor do parametro `google` do callback: 'connected' ou 'error'. */
  google?: string;
  /** Valor do parametro `reason` quando google=error. */
  reason?: string;
  /** Valor do parametro `channel` quando a conexao ficou pendente. */
  channel?: string;
}

export function GoogleOAuthResultBanner({
  google,
  reason,
  channel,
}: GoogleOAuthResultBannerProps) {
  if (!google) return null;

  if (google === 'connected') {
    const pending = channel === 'pending';
    return (
      <div
        data-testid="google-oauth-result-banner"
        role="status"
        className="bg-card border border-border rounded-2xl p-4"
      >
        <p className={pending ? 'text-sm text-muted-foreground' : 'text-sm text-foreground'}>
          {pending
            ? 'Agenda Google conectada. A sincronizacao em segundo plano ainda nao foi ativada e sera retomada automaticamente.'
            : 'Agenda Google conectada com sucesso. Seus horarios ocupados serao bloqueados no painel.'}
        </p>
      </div>
    );
  }

  const detail = reason ? (KNOWN_REASONS[reason] ?? `erro inesperado (${reason}).`) : null;
  return (
    <div
      data-testid="google-oauth-result-banner"
      role="alert"
      className="bg-card border border-destructive/40 rounded-2xl p-4"
    >
      <p className="text-sm text-destructive">
        Nao foi possivel conectar a agenda Google
        {detail ? `: ${detail}` : '. Tente novamente.'}
      </p>
    </div>
  );
}
