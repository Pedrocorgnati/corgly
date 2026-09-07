import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DocumentSearch } from '@/components/session/DocumentSearch';
import { apiClient, ApiError } from '@/lib/api-client';
import { ROUTES } from '@/lib/constants/routes';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Defesa da busca nos cadernos (`DocumentSearch`), montada na tela de historico
 * do aluno. O componente existia sem consumidor E sem teste; este arquivo cobre
 * o que a tela promete ao aluno:
 *
 *  - debounce (nao dispara consulta a cada tecla);
 *  - cancelamento: tecla nova aborta a busca em andamento e a resposta que
 *    chega atrasada NAO aparece como erro nem como resultado velho;
 *  - minimo de caracteres (termo curto reage, mas nao consulta o servidor);
 *  - vazio, carregando e erro renderizaveis e distintos;
 *  - destino do resultado: `/history/{sessionId}/notes`, rota que existe de
 *    verdade no App Router (o teste checa o arquivo em disco, nao a intencao).
 *
 * As mensagens sao as REAIS (`i18n/messages/pt-BR.json`): dicionario improvisado
 * esconderia chave ausente, que e o defeito que a guarda de i18n persegue.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// `apiClient` e mockado; `ApiError` continua REAL porque o componente decide o
// texto do erro a partir de `error.message` de uma instancia de verdade.
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const api = vi.mocked(apiClient);

/** Contrato lido de `src/components/session/DocumentSearch.tsx`. */
const ENDPOINT = '/api/v1/documents/search';
const DEBOUNCE_MS = 350;
const PAGE_SIZE = 10;

/** Rota de destino do resultado, conferida em disco pelo teste de destino. */
const NOTES_ROUTE_FILE = 'src/app/(student)/history/[bookingId]/notes/page.tsx';

interface Hit {
  id: string;
  sessionId: string;
  updatedAt: string;
  session: { id: string; startAt: string; status: string; studentName: string | null };
  snippet: string;
}

function hit(overrides: Partial<Hit> = {}): Hit {
  return {
    id: 'doc-1',
    sessionId: 'sess-1',
    updatedAt: '2026-03-01T10:00:00.000Z',
    session: {
      id: 'sess-1',
      startAt: '2026-02-28T14:00:00.000Z',
      status: 'COMPLETED',
      studentName: 'Aluno Teste',
      ...overrides.session,
    },
    snippet: 'usamos o <mark>present</mark> perfect na aula',
    ...overrides,
  };
}

/** Corpo que a rota devolve: `apiResponse(...)` embrulha a pagina em `data`. */
function payload(
  data: Hit[],
  extra: Partial<{ total: number; page: number; limit: number; totalPages: number }> = {},
) {
  return {
    data: {
      data,
      total: data.length,
      page: 1,
      limit: PAGE_SIZE,
      totalPages: data.length ? 1 : 0,
      ...extra,
    },
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Promessa controlada pelo teste: e assim que se congela uma busca em voo. */
function deferred<T>(): Deferred<T> {
  const box: { resolve?: (value: T) => void; reject?: (reason: unknown) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  return {
    promise,
    resolve: (value) => box.resolve?.(value),
    reject: (reason) => box.reject?.(reason),
  };
}

function renderSearch() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <DocumentSearch />
    </NextIntlClientProvider>,
  );
}

function digitar(valor: string) {
  fireEvent.change(screen.getByTestId('document-search-input'), { target: { value: valor } });
}

/** Avanca o relogio falso e deixa as promessas pendentes assentarem. */
async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Deixa as promessas assentarem sem mexer no relogio. */
async function assentar() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('DocumentSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nao consulta o servidor antes de o debounce vencer', async () => {
    api.get.mockResolvedValue(payload([]));
    renderSearch();

    digitar('present perfect');
    expect(api.get).not.toHaveBeenCalled();

    await avancar(DEBOUNCE_MS - 1);
    expect(api.get).not.toHaveBeenCalled();

    await avancar(1);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ params: { q: 'present perfect', page: 1, limit: PAGE_SIZE } }),
    );
  });

  it('teclas dentro da janela de debounce viram UMA consulta, com o termo final', async () => {
    api.get.mockResolvedValue(payload([]));
    renderSearch();

    digitar('pr');
    await avancar(200);
    digitar('pre');
    await avancar(200);
    digitar('pres');
    await avancar(DEBOUNCE_MS);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({ params: { q: 'pres', page: 1, limit: PAGE_SIZE } }),
    );
  });

  it('tecla nova aborta a busca que ja estava em voo', async () => {
    const primeira = deferred<unknown>();
    api.get.mockReturnValueOnce(primeira.promise).mockResolvedValue(payload([]));
    renderSearch();

    digitar('pre');
    await avancar(DEBOUNCE_MS);

    const signalDaPrimeira = api.get.mock.calls[0]?.[1]?.signal;
    expect(signalDaPrimeira?.aborted).toBe(false);

    digitar('presente');
    expect(signalDaPrimeira?.aborted).toBe(true);

    await avancar(DEBOUNCE_MS);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({ params: { q: 'presente', page: 1, limit: PAGE_SIZE } }),
    );
  });

  it('resposta da busca cancelada nao vira erro nem resultado na tela', async () => {
    const primeira = deferred<unknown>();
    const segunda = deferred<unknown>();
    api.get.mockReturnValueOnce(primeira.promise).mockReturnValueOnce(segunda.promise);
    renderSearch();

    digitar('pre');
    await avancar(DEBOUNCE_MS);
    digitar('presente');
    await avancar(DEBOUNCE_MS);

    // A busca cancelada responde atrasada, como o apiClient faz num abort.
    primeira.reject(new ApiError('Requisicao cancelada.', 0, 'ABORTED'));
    await assentar();

    expect(screen.queryByTestId('document-search-error')).toBeNull();
    expect(screen.getByTestId('document-search-loading')).toBeInTheDocument();

    segunda.resolve(payload([hit()]));
    await assentar();

    expect(screen.getByTestId('document-search-list')).toBeInTheDocument();
    expect(screen.queryByTestId('document-search-error')).toBeNull();
    expect(screen.queryByTestId('document-search-loading')).toBeNull();
  });

  it('termo curto avisa o minimo de caracteres e nao chama o servidor', async () => {
    api.get.mockResolvedValue(payload([]));
    renderSearch();

    digitar('a');
    await avancar(DEBOUNCE_MS * 2);

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByTestId('document-search-min-chars')).toHaveTextContent(
      'Digite pelo menos 2 caracteres para buscar.',
    );
    expect(screen.queryByTestId('document-search-results')).toBeNull();

    digitar('ab');
    expect(screen.queryByTestId('document-search-min-chars')).toBeNull();
    expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
  });

  it('enquanto a resposta nao chega, mostra carregando (e nao vazio)', async () => {
    const pendente = deferred<unknown>();
    api.get.mockReturnValue(pendente.promise);
    renderSearch();

    digitar('present');
    await avancar(DEBOUNCE_MS);

    expect(screen.getByTestId('document-search-loading')).toHaveTextContent('Buscando...');
    expect(screen.getByTestId('document-search-input-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('document-search-empty')).toBeNull();

    pendente.resolve(payload([hit()]));
    await assentar();

    expect(screen.queryByTestId('document-search-loading')).toBeNull();
    expect(screen.queryByTestId('document-search-input-loading')).toBeNull();
  });

  it('estado vazio nomeia o termo que nao encontrou nada', async () => {
    api.get.mockResolvedValue(payload([]));
    renderSearch();

    digitar('xilofone');
    await avancar(DEBOUNCE_MS);

    expect(screen.getByTestId('document-search-empty')).toHaveTextContent(
      'Nenhum caderno menciona "xilofone".',
    );
    expect(screen.queryByTestId('document-search-list')).toBeNull();
    expect(screen.queryByTestId('document-search-error')).toBeNull();
  });

  it('erro do servidor aparece com a mensagem que o servidor deu', async () => {
    api.get.mockRejectedValue(new ApiError('Servico indisponivel.', 500, 'INTERNAL_ERROR'));
    renderSearch();

    digitar('present');
    await avancar(DEBOUNCE_MS);

    expect(screen.getByTestId('document-search-error')).toHaveTextContent(
      'A busca falhou: Servico indisponivel.',
    );
    expect(screen.queryByTestId('document-search-empty')).toBeNull();
    expect(screen.queryByTestId('document-search-loading')).toBeNull();
  });

  it('falha sem mensagem cai na copy generica do catalogo (nunca em silencio)', async () => {
    api.get.mockRejectedValue(new Error(''));
    renderSearch();

    digitar('present');
    await avancar(DEBOUNCE_MS);

    expect(screen.getByTestId('document-search-error')).toHaveTextContent(
      'A busca falhou: erro inesperado. Tente de novo em instantes.',
    );
  });

  it('cada resultado leva ao caderno da aula, numa rota que existe no App Router', async () => {
    api.get.mockResolvedValue(payload([hit({ id: 'doc-9', sessionId: 'sess-42' })]));
    renderSearch();

    digitar('present');
    await avancar(DEBOUNCE_MS);

    const link = screen.getByTestId('document-search-item-doc-9-link');
    expect(link).toHaveAttribute('href', `${ROUTES.HISTORY}/sess-42/notes`);
    expect(link).toHaveAttribute('href', '/history/sess-42/notes');
    // O destaque do termo chega como HTML do servidor e precisa renderizar.
    expect(link.querySelector('mark')?.textContent).toBe('present');

    // O destino nao pode ser uma rota imaginaria: o arquivo existe em disco.
    expect(existsSync(path.join(process.cwd(), NOTES_ROUTE_FILE))).toBe(true);
  });

  it('paginacao pede a proxima pagina do mesmo termo', async () => {
    api.get.mockResolvedValue(payload([hit()], { total: 12, totalPages: 2 }));
    renderSearch();

    digitar('present');
    await avancar(DEBOUNCE_MS);

    expect(screen.getByTestId('document-search-pagination')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('document-search-pagination-next-button'));
    await avancar(DEBOUNCE_MS);

    expect(api.get).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({ params: { q: 'present', page: 2, limit: PAGE_SIZE } }),
    );
  });
});
