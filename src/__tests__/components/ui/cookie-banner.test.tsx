import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { CookieBanner } from '@/components/ui/cookie-banner';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Este arquivo renderizava com um objeto `messages` escrito a mao que havia
 * perdido `cookieBanner.manage_preferences`. O banner renderizava a chave crua,
 * o next-intl cuspia `MISSING_MESSAGE` no stderr e os testes passavam assim
 * mesmo — catalogo de mentira dando verde sobre copy quebrada. Agora renderiza
 * com o catalogo pt-BR real; `src/__tests__/i18n/message-fixtures.test.ts`
 * impede a volta do fixture a mao.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// O dialog de personalizacao tem teste proprio; aqui so precisa do gatilho de save.
vi.mock('@/components/ui/cookie-customize-dialog', () => ({
  CookieCustomizeDialog: ({ open, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (prefs: { analytics: boolean; marketing: boolean }) => void }) => {
    if (!open) return null;
    return (
      <div data-testid="customize-dialog">
        <button onClick={() => onSave({ analytics: true, marketing: false })}>
          Salvar Preferencias
        </button>
      </div>
    );
  },
}));

vi.mock('sonner', () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const copy = ptBR.cookieBanner;
/**
 * Literais de proposito, nao `API.AUTH.COOKIE_CONSENT` / `ROUTES.*`: assertar
 * contra a mesma constante que o componente consome passaria dos dois jeitos.
 * Os tres valores foram conferidos contra o que serve cada destino —
 * `src/app/api/v1/auth/cookie-consent/`, `src/app/(public)/privacy/` e
 * `src/app/(public)/cookies/preferences/`. Mexeu na constante sem mexer na
 * rota, isto aqui fica vermelho (Zero Orfaos: link sem destino).
 */
const CONSENT_ENDPOINT = '/api/v1/auth/cookie-consent';
const PRIVACY_HREF = '/privacy';
const COOKIE_PREFERENCES_HREF = '/cookies/preferences';

/**
 * O double PRECISA ser instalado aqui, e nao no escopo do modulo: o
 * `vitest.setup.ts` chama `server.listen()` do MSW num `beforeAll`, que corre
 * DEPOIS da avaliacao deste arquivo e troca `globalThis.fetch` pelo interceptor.
 * Instalado no topo, o double era engolido — e o interceptor ainda rejeitava a
 * requisicao antes de chamar por baixo, porque o `AbortSignal` do jsdom nao e
 * instancia do `AbortSignal` do undici. Resultado: `fetch` "nao era chamado" e o
 * teste acusava o componente por um defeito do proprio arranjo do teste.
 */
let mockFetch: ReturnType<typeof vi.fn>;

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <CookieBanner />
    </NextIntlClientProvider>
  );
}

/** Corpo JSON do unico POST de consentimento registrado. */
function consentPayload(): { analytics: boolean; marketing: boolean } {
  const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
  return JSON.parse(String(init.body));
}

/** URL do unico POST de consentimento registrado (string ou Request). */
function consentUrl(): string {
  const [request] = mockFetch.mock.calls[0] as [string | Request];
  return typeof request === 'string' ? request : request.url;
}

describe('CookieBanner', () => {
  beforeEach(() => {
    document.cookie = 'corgly_consent=; max-age=0; path=/';
    vi.clearAllMocks();
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderiza quando nao ha cookie de consentimento', () => {
    renderWithI18n();

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
  });

  it('nao renderiza quando cookie de consentimento ja existe', () => {
    document.cookie = 'corgly_consent=all; path=/';
    renderWithI18n();

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('renderiza descricao e link de privacidade', () => {
    renderWithI18n();

    expect(screen.getByText(new RegExp(copy.description.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByTestId('cookie-banner-privacy-link')).toHaveTextContent(copy.privacy_link);
  });

  it('renderiza os 3 botoes de acao com a copy publicada', () => {
    renderWithI18n();

    expect(screen.getByTestId('cookie-banner-customize-button')).toHaveTextContent(copy.customize);
    expect(screen.getByTestId('cookie-banner-reject-button')).toHaveTextContent(copy.reject);
    expect(screen.getByTestId('cookie-banner-accept-all-button')).toHaveTextContent(copy.accept_all);
  });

  /**
   * Defesa contra o defeito que este arquivo escondia: quando o catalogo nao
   * resolve uma chave, o next-intl renderiza o caminho cru (`cookieBanner.x`).
   * Renderizar o nome da chave para o usuario e copy quebrada, nao copy.
   */
  it('nao vaza caminho de chave i18n nao resolvida na tela', () => {
    renderWithI18n();

    expect(screen.getByTestId('cookie-banner').textContent ?? '').not.toMatch(/cookieBanner\./);
  });

  it('esconde banner ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('define cookie "all" ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

    expect(document.cookie).toContain('corgly_consent=all');
  });

  it('envia consent para API ao aceitar todos', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(consentUrl()).toContain(CONSENT_ENDPOINT);
    expect(consentPayload()).toEqual({ analytics: true, marketing: true });
  });

  it('esconde banner ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-reject-button'));

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('define cookie "essential" ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-reject-button'));

    expect(document.cookie).toContain('corgly_consent=essential');
  });

  it('envia consent false/false para API ao recusar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-reject-button'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(consentUrl()).toContain(CONSENT_ENDPOINT);
    expect(consentPayload()).toEqual({ analytics: false, marketing: false });
  });

  /**
   * Zero Silencio: o cookie e a fonte primaria, entao a escolha vale mesmo sem
   * rede — mas o POST e o registro de auditoria do consentimento. Quando ele
   * falha, o usuario tem que saber que a escolha ficou so neste navegador.
   */
  it('avisa o usuario quando a sincronizacao com a API falha', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

    await waitFor(() => expect(toast.message).toHaveBeenCalledTimes(1));
    expect(toast.message).toHaveBeenCalledWith(copy.sync_failed_title, {
      description: copy.sync_failed_description,
    });
  });

  it('avisa o usuario quando a API responde erro HTTP', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-reject-button'));

    await waitFor(() => expect(toast.message).toHaveBeenCalledTimes(1));
  });

  it('nao avisa nada quando a sincronizacao da certo', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(toast.message).not.toHaveBeenCalled();
  });

  /**
   * `AbortSignal.timeout` nao existe em Safari < 16. Antes, a chamada crua
   * lancava sincronamente de dentro do onClick e a excecao escapava do handler.
   */
  it('ainda envia o consent em browser sem AbortSignal.timeout', async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error simula browser legado: a propriedade some do runtime
    delete AbortSignal.timeout;
    try {
      const user = userEvent.setup();
      renderWithI18n();

      await user.click(screen.getByTestId('cookie-banner-accept-all-button'));

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it('abre dialog de personalizacao ao clicar Personalizar', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-customize-button'));

    expect(screen.getByTestId('customize-dialog')).toBeInTheDocument();
  });

  it('fecha banner apos salvar preferencias personalizadas', async () => {
    const user = userEvent.setup();
    renderWithI18n();

    await user.click(screen.getByTestId('cookie-banner-customize-button'));
    await user.click(screen.getByText('Salvar Preferencias'));

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(consentPayload()).toEqual({ analytics: true, marketing: false });
  });

  it('possui role="dialog" com aria-label', () => {
    renderWithI18n();

    expect(screen.getByRole('dialog', { name: copy.aria })).toBeInTheDocument();
  });

  it('link de privacidade aponta para a politica publicada', () => {
    renderWithI18n();

    expect(screen.getByTestId('cookie-banner-privacy-link')).toHaveAttribute('href', PRIVACY_HREF);
  });

  it('link de preferencias aponta para a pagina de gestao', () => {
    renderWithI18n();

    const link = screen.getByTestId('cookie-banner-preferences-link');
    expect(link).toHaveTextContent(copy.manage_preferences);
    expect(link).toHaveAttribute('href', COOKIE_PREFERENCES_HREF);
  });
});
