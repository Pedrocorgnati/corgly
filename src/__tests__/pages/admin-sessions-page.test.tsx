/**
 * FX-12C — `/admin/sessions` (server page) + `AdminSessionsClient`.
 *
 * A tela buscava `GET /api/v1/sessions` (a listagem GENERICA) e depois
 * reclamava da resposta: aquela rota nao devolve `studentName` nem `score`, e
 * nao entende `hasFeedback`. Resultado: as colunas "Aluno" e "Score" caiam no
 * traco em TODAS as linhas e o filtro de feedback era inalcancavel.
 *
 * O que estes testes travam:
 *
 *  1. a pagina consome `GET /api/v1/admin/sessions`, com o cookie de sessao
 *     encaminhado (o mesmo padrao de credencial do detalhe e de
 *     `src/actions/admin-students.ts`);
 *  2. page/limit/status/hasFeedback viajam na querystring, e `?page=` fora de
 *     contrato nao vira `skip` invalido;
 *  3. a tabela mostra o nome do aluno e a nota reais;
 *  4. o traco da coluna Score tem significado declarado na tela;
 *  5. paginacao e filtro funcionam ponta a ponta (preservam um ao outro);
 *  6. falha de rede, 401/403 e payload fora do contrato viram estado de erro
 *     visivel — nunca tabela vazia mentindo "nenhuma sessao encontrada".
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  cookieString: 'corgly_token=jwt-de-admin',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => mocks.cookieString }),
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import AdminSessionsPage from '@/app/(admin)/admin/sessions/page';

type Linha = {
  id: string;
  studentId: string;
  startAt: string;
  endAt: string;
  status: string;
  studentName: string;
  score: number | null;
};

function linha(overrides: Partial<Linha> = {}): Linha {
  return {
    id: 'session-1',
    studentId: 'student-1',
    startAt: '2026-03-25T14:00:00.000Z',
    endAt: '2026-03-25T14:50:00.000Z',
    status: 'COMPLETED',
    studentName: 'Ana Souza',
    score: 4.3,
    ...overrides,
  };
}

function pagina(data: Linha[], meta: Partial<{ total: number; page: number; limit: number; totalPages: number }> = {}) {
  return {
    data,
    total: meta.total ?? data.length,
    page: meta.page ?? 1,
    limit: meta.limit ?? 20,
    totalPages: meta.totalPages ?? 1,
  };
}

/** Resposta no envelope de `apiResponse` (src/lib/auth.ts). */
function respostaOk(corpo: unknown): Response {
  return new Response(JSON.stringify({ data: corpo, error: null, message: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function urlChamada(): URL {
  const chamada = fetchMock.mock.calls[0];
  if (!chamada) throw new Error('A pagina nao chamou fetch nenhuma vez.');
  return new URL(chamada[0]);
}

function renderizar(params: Record<string, string> = {}) {
  return AdminSessionsPage({ searchParams: Promise.resolve(params) });
}

/**
 * Renderiza a page ja dentro do provider de i18n.
 *
 * `SessionList` passou a resolver o rotulo dos nove status pelo catalogo
 * (`sessionStatus.*`) em vez de ler o pt-BR que vinha congelado dentro de
 * `SESSION_STATUS_MAP`; sem provider o `useTranslations` estoura antes de
 * pintar a tabela. As mensagens sao as REAIS de `i18n/messages/pt-BR.json`:
 * dicionario improvisado aqui esconderia regressao de i18n.
 */
async function renderizarNaTela(params: Record<string, string> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      {await renderizar(params)}
    </NextIntlClientProvider>,
  );
}

describe('/admin/sessions (server page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(respostaOk(pagina([linha()])));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('de onde vem o dado', () => {
    it('consome a rota ADMIN de sessoes, nao a generica', async () => {
      await renderizar();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(urlChamada().pathname).toBe('/api/v1/admin/sessions');
    });

    it('encaminha o cookie de sessao do admin para a API interna', async () => {
      await renderizar();

      const init = fetchMock.mock.calls[0]?.[1];
      expect(init?.headers).toMatchObject({ Cookie: 'corgly_token=jwt-de-admin' });
      expect(init?.cache).toBe('no-store');
    });

    it('leva pagina, limite e os dois filtros na querystring', async () => {
      await renderizar({ page: '2', status: 'COMPLETED', hasFeedback: 'false' });

      const qs = urlChamada().searchParams;
      expect(qs.get('page')).toBe('2');
      expect(qs.get('limit')).toBe('20');
      expect(qs.get('status')).toBe('COMPLETED');
      expect(qs.get('hasFeedback')).toBe('false');
    });

    it('sem hasFeedback na URL, o filtro nao vai para a rota (lista tudo)', async () => {
      await renderizar();

      expect(urlChamada().searchParams.has('hasFeedback')).toBe(false);
    });

    it.each([['abc'], ['-3'], ['0'], ['']])(
      '?page=%s volta para a pagina 1 em vez de virar skip invalido',
      async (valor) => {
        await renderizar({ page: valor });

        expect(urlChamada().searchParams.get('page')).toBe('1');
      },
    );
  });

  describe('o que o admin ve', () => {
    it('mostra o nome do aluno e a nota reais, nao o placeholder', async () => {
      fetchMock.mockResolvedValue(
        respostaOk(
          pagina([
            linha({ id: 's-1', studentName: 'Ana Souza', score: 4.3 }),
            linha({ id: 's-2', studentId: 'student-2', studentName: 'Bruno Lima', score: 2 }),
          ]),
        ),
      );

      await renderizarNaTela();

      const primeira = screen.getByTestId('admin-sessions-row-s-1');
      expect(primeira).toHaveTextContent('Ana Souza');
      expect(primeira).toHaveTextContent('4.3/5');

      const segunda = screen.getByTestId('admin-sessions-row-s-2');
      expect(segunda).toHaveTextContent('Bruno Lima');
      expect(segunda).toHaveTextContent('2/5');
    });

    it('aula sem feedback: nome continua la e o traco tem significado declarado', async () => {
      fetchMock.mockResolvedValue(
        respostaOk(pagina([linha({ id: 's-3', studentName: 'Carla Dias', score: null })])),
      );

      await renderizarNaTela();

      const linhaSemFeedback = screen.getByTestId('admin-sessions-row-s-3');
      expect(linhaSemFeedback).toHaveTextContent('Carla Dias');
      expect(linhaSemFeedback).toHaveTextContent('—');
      expect(screen.getByTestId('admin-sessions-score-legend')).toHaveTextContent(
        /aula ainda sem feedback registrado/i,
      );
    });
  });

  describe('filtro de feedback (ponta a ponta)', () => {
    it('marca a opcao vigente vinda da URL', async () => {
      await renderizarNaTela({ hasFeedback: 'false' });

      expect(screen.getByTestId('admin-sessions-feedback-filter-without-button')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('admin-sessions-feedback-filter-all-button')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('escolher "Com feedback" navega com o filtro e volta para a pagina 1', async () => {
      await renderizarNaTela({ page: '3', status: 'COMPLETED' });

      fireEvent.click(screen.getByTestId('admin-sessions-feedback-filter-with-button'));

      expect(mocks.router.push).toHaveBeenCalledWith(
        '/admin/sessions?status=COMPLETED&hasFeedback=true&page=1',
      );
    });
  });

  describe('paginacao (ponta a ponta)', () => {
    it('proxima pagina preserva os filtros vigentes', async () => {
      fetchMock.mockResolvedValue(
        respostaOk(pagina([linha()], { total: 45, page: 2, totalPages: 3 })),
      );

      await renderizarNaTela({ page: '2', status: 'COMPLETED', hasFeedback: 'true' });

      fireEvent.click(screen.getByTestId('admin-sessions-pagination-next-button'));

      expect(mocks.router.push).toHaveBeenCalledWith(
        '/admin/sessions?status=COMPLETED&hasFeedback=true&page=3',
      );
    });

    it('pagina alem do fim: diz o que houve e oferece a volta, sem fingir lista vazia', async () => {
      fetchMock.mockResolvedValue(respostaOk(pagina([], { total: 45, page: 99, totalPages: 3 })));

      await renderizarNaTela({ page: '99' });

      expect(screen.getByTestId('admin-sessions-out-of-range')).toHaveTextContent(
        'A página 99 não existe',
      );
      expect(screen.queryByTestId('admin-sessions-empty')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('admin-sessions-out-of-range-reset-button'));
      expect(mocks.router.push).toHaveBeenCalledWith('/admin/sessions?page=1');
    });
  });

  describe('caminhos tristes', () => {
    it('falha de rede vira erro visivel, nao tabela vazia', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await renderizarNaTela();

      expect(screen.getByTestId('admin-sessions-fetch-error')).toHaveTextContent(
        'Não foi possível falar com o servidor.',
      );
      expect(screen.queryByTestId('admin-sessions-table')).not.toBeInTheDocument();
    });

    it('401 diz que a sessao de admin caiu', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: 'Nao autenticado.' }), { status: 401 }),
      );

      await renderizarNaTela();

      expect(screen.getByTestId('admin-sessions-fetch-error')).toHaveTextContent(
        /Sessão de administrador expirada/,
      );
    });

    it('payload sem studentName/score e recusado em vez de virar coluna vazia', async () => {
      fetchMock.mockResolvedValue(
        respostaOk({
          data: [
            {
              id: 's-1',
              startAt: '2026-03-25T14:00:00.000Z',
              endAt: '2026-03-25T14:50:00.000Z',
              status: 'COMPLETED',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );

      await renderizarNaTela();

      expect(screen.getByTestId('admin-sessions-fetch-error')).toHaveTextContent(
        'Resposta do servidor fora do formato esperado.',
      );
      expect(screen.queryByTestId('admin-sessions-table')).not.toBeInTheDocument();
    });
  });
});
