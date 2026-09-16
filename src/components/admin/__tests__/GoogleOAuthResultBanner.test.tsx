import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GoogleOAuthResultBanner } from '../GoogleOAuthResultBanner';

describe('GoogleOAuthResultBanner', () => {
  it('sem parametro google: nao renderiza nada', () => {
    const { container } = render(<GoogleOAuthResultBanner />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('google-oauth-result-banner')).not.toBeInTheDocument();
  });

  it('google=connected: banner de sucesso com role=status', () => {
    render(<GoogleOAuthResultBanner google="connected" />);

    const banner = screen.getByTestId('google-oauth-result-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('conectada com sucesso');
  });

  it('google=connected com channel=pending: banner avisa que a sincronizacao ficou pendente', () => {
    render(<GoogleOAuthResultBanner google="connected" channel="pending" />);

    const banner = screen.getByTestId('google-oauth-result-banner');
    expect(banner).toHaveTextContent('sera retomada automaticamente');
  });

  it('google=error com reason conhecido: banner de erro com role=alert e motivo amigavel', () => {
    render(<GoogleOAuthResultBanner google="error" reason="scope_rejected" />);

    const banner = screen.getByTestId('google-oauth-result-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Nao foi possivel conectar');
    expect(banner).toHaveTextContent('somente leitura');
  });

  it('google=error com reason desconhecido: cai no texto generico com o codigo', () => {
    render(<GoogleOAuthResultBanner google="error" reason="erro_novo_do_google" />);

    const banner = screen.getByTestId('google-oauth-result-banner');
    expect(banner).toHaveTextContent('erro inesperado (erro_novo_do_google)');
  });
});
