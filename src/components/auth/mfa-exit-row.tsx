'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { API, ROUTES } from '@/lib/constants/routes';

/**
 * Saidas das telas publicas de MFA (challenge e setup): encerrar a sessao ou
 * voltar ao inicio. Espelha useAuth.logout (POST logout + reload completo), que
 * nao esta montado nas paginas publicas.
 */
export function MfaExitRow() {
  const [isLeaving, setIsLeaving] = useState(false);

  async function handleLogout() {
    setIsLeaving(true);
    try {
      await apiClient.post(API.AUTH.LOGOUT, {}, { skipAuthRedirect: true });
    } catch {
      // Sessao ja invalida ou rede indisponivel: o reload abaixo limpa o estado local.
    } finally {
      window.location.href = ROUTES.HOME;
    }
  }

  return (
    <div
      data-testid="auth-mfa-exit-row"
      className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground"
    >
      <button
        type="button"
        data-testid="auth-mfa-logout-button"
        onClick={handleLogout}
        disabled={isLeaving}
        className="hover:text-foreground hover:underline disabled:opacity-60"
      >
        {isLeaving ? 'Saindo...' : 'Sair da conta'}
      </button>
      <span aria-hidden>|</span>
      <Link
        data-testid="auth-mfa-home-link"
        href={ROUTES.HOME}
        className="hover:text-foreground hover:underline"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
