/**
 * COVERAGE-GAP-G04 — contrato da biblioteca administrativa de exercícios.
 *
 * A action é a fronteira entre os search params da tela e a API interna. Estes
 * testes mantêm essa fronteira pequena: autorização vem antes da validação,
 * filtros vazios desaparecem, valores válidos são normalizados e o JSON que
 * chega ao cliente contém apenas o DTO da biblioteca.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  cookies: vi.fn(),
  internalApiOrigin: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

vi.mock('@/lib/internal-api', () => ({
  internalApiOrigin: mocks.internalApiOrigin,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  archiveAdminExercise,
  getAdminExercises,
  type AdminExerciseFilters,
} from '@/actions/admin-exercises';

const INTERNAL_ORIGIN = 'https://corgly-internal.test';
const EXERCISE_ID = 'd38db197-a9ac-4ccf-aa92-cf05ca4cdd46';

const adminSession = {
  user: {
    id: 'admin-1',
    role: 'ADMIN',
    isFirstPurchase: false,
    onboardingCompletedAt: null,
    emailConfirmed: true,
    tokenVersion: 0,
  },
};

const studentSession = {
  user: {
    ...adminSession.user,
    id: 'student-1',
    role: 'STUDENT',
  },
};

const exerciseRow = {
  id: EXERCISE_ID,
  internalTitle: 'Verbos no futuro',
  studentTitle: 'Pratique o futuro',
  predominantKind: 'VERB_CLOZE',
  supportLanguage: 'PT_BR',
  level: 3,
  subject: 'Gramática',
  tags: ['verbos', 'futuro'],
  itemCount: 8,
  status: 'PUBLISHED',
  activeAssignmentCount: 12,
  updatedAt: '2026-09-09T12:34:56.000Z',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, message: null }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubListFetch(data: unknown = { items: [], total: 0, page: 1, limit: 20 }) {
  const fetchSpy = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >();
  fetchSpy.mockResolvedValue(jsonResponse(data));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function calledUrl(fetchSpy: ReturnType<typeof stubListFetch>) {
  const input = fetchSpy.mock.calls[0]?.[0];
  if (input === undefined) throw new Error('fetch não foi chamado');
  return new URL(String(input));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(adminSession);
  mocks.cookies.mockResolvedValue({
    toString: () => 'corgly_token=jwt-de-teste',
  });
  mocks.internalApiOrigin.mockResolvedValue(INTERNAL_ORIGIN);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAdminExercises — autorização ADMIN primeiro', () => {
  it.each([
    ['sem sessão', null],
    ['papel não administrativo', studentSession],
  ])('bloqueia %s antes de validar filtros ou acessar a API', async (_label, session) => {
    mocks.getSession.mockResolvedValue(session);
    const fetchSpy = stubListFetch();

    const result = await getAdminExercises({ status: 'STATUS_INVALIDO' });

    expect(result).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.internalApiOrigin).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getAdminExercises — filtros, busca e paginação', () => {
  it.each([
    ['busca textual', { search: '  futuro simples  ' }, 'q', 'futuro simples'],
    ['nível', { level: '0' }, 'level', '0'],
    ['matéria', { subject: '  Gramática  ' }, 'subject', 'Gramática'],
    ['idioma', { supportLanguage: 'EN_US' }, 'supportLanguage', 'EN_US'],
    ['status', { status: 'DRAFT' }, 'status', 'DRAFT'],
    ['tag', { tag: '  verbos  ' }, 'tag', 'verbos'],
    ['página', { page: '3' }, 'page', '3'],
    ['limite', { limit: '40' }, 'limit', '40'],
  ])(
    'aceita e normaliza %s isoladamente',
    async (_label, input, expectedName, expectedValue) => {
      const fetchSpy = stubListFetch();

      await getAdminExercises(input);

      const url = calledUrl(fetchSpy);
      expect(url.origin).toBe(INTERNAL_ORIGIN);
      expect(url.pathname).toBe('/api/v1/admin/exercises');
      expect([...url.searchParams.entries()]).toEqual([[expectedName, expectedValue]]);
    },
  );

  it('normaliza todos os campos vazios para ausência de filtro', async () => {
    const fetchSpy = stubListFetch();

    await getAdminExercises({
      search: '   ',
      level: '',
      subject: '',
      supportLanguage: '',
      status: '',
      tag: '   ',
      page: '',
      limit: '',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calledUrl(fetchSpy).href).toBe(`${INTERNAL_ORIGIN}/api/v1/admin/exercises`);
  });

  it('preserva busca, cinco filtros e paginação quando combinados', async () => {
    const fetchSpy = stubListFetch();

    await getAdminExercises({
      search: '  futuro simples  ',
      level: '3',
      subject: '  Gramática  ',
      supportLanguage: 'PT_BR',
      status: 'PUBLISHED',
      tag: '  verbos  ',
      page: '4',
      limit: '25',
    });

    expect([...calledUrl(fetchSpy).searchParams.entries()]).toEqual([
      ['q', 'futuro simples'],
      ['level', '3'],
      ['subject', 'Gramática'],
      ['supportLanguage', 'PT_BR'],
      ['status', 'PUBLISHED'],
      ['tag', 'verbos'],
      ['page', '4'],
      ['limit', '25'],
    ]);
  });

  it.each([
    ['busca', { search: 'x'.repeat(201) }],
    ['nível', { level: '101' }],
    ['matéria', { subject: 'x'.repeat(81) }],
    ['idioma', { supportLanguage: 'FR_FR' }],
    ['status', { status: 'DELETED' }],
    ['tag', { tag: 'x'.repeat(61) }],
    ['página', { page: '0' }],
    ['limite', { limit: '101' }],
  ])('rejeita %s inválido sem acessar a API', async (_label, input) => {
    const fetchSpy = stubListFetch();

    const result = await getAdminExercises(input as AdminExerciseFilters);

    expect(result).toEqual({ data: null, error: 'Filtros inválidos.' });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.internalApiOrigin).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejeita chaves desconhecidas por contrato estrito', async () => {
    const fetchSpy = stubListFetch();

    const result = await getAdminExercises({ duplicate: true } as AdminExerciseFilters);

    expect(result).toEqual({ data: null, error: 'Filtros inválidos.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['null', { level: null }],
    ['boolean false', { level: false }],
    ['boolean true', { page: true }],
    ['array', { page: ['2'] }],
    ['objeto', { limit: { value: 20 } }],
    ['notacao hexadecimal', { page: '0x10' }],
    ['notacao exponencial', { limit: '1e2' }],
  ])('rejeita coerção numérica hostil: %s', async (_label, input) => {
    const fetchSpy = stubListFetch();

    const result = await getAdminExercises(input as unknown as AdminExerciseFilters);

    expect(result).toEqual({ data: null, error: 'Filtros inválidos.' });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.internalApiOrigin).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getAdminExercises — DTO da biblioteca', () => {
  it('entrega id mais os 11 campos de dados, removendo extras e sem campo de ações', async () => {
    const fetchSpy = stubListFetch({
      items: [
        {
          ...exerciseRow,
          actions: ['EDIT', 'ARCHIVE'],
          publishedAt: '2026-09-01T00:00:00.000Z',
          prismaRelation: { assignments: [] },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      extraEnvelopeField: true,
    });

    const result = await getAdminExercises();

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      items: [exerciseRow],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(Object.keys(result.data?.items[0] ?? {}).sort()).toEqual(
      [
        'id',
        'internalTitle',
        'studentTitle',
        'predominantKind',
        'supportLanguage',
        'level',
        'subject',
        'tags',
        'itemCount',
        'status',
        'activeAssignmentCount',
        'updatedAt',
      ].sort(),
    );
    expect(result.data?.items[0]).not.toHaveProperty('actions');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${INTERNAL_ORIGIN}/api/v1/admin/exercises`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});

describe('archiveAdminExercise', () => {
  it('aplica autorização antes da validação do UUID', async () => {
    mocks.getSession.mockResolvedValue(null);
    const fetchSpy = stubListFetch();

    const result = await archiveAdminExercise('uuid-invalido');

    expect(result).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejeita UUID inválido para ADMIN sem chamar a rota', async () => {
    const fetchSpy = stubListFetch();

    const result = await archiveAdminExercise('uuid-invalido');

    expect(result).toEqual({
      data: null,
      error: 'Identificador de exercício inválido.',
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('faz POST somente na rota canônica de arquivamento e valida o retorno', async () => {
    const fetchSpy = stubListFetch({
      id: EXERCISE_ID,
      status: 'ARCHIVED',
      internalTitle: 'campo que não cruza a fronteira',
    });

    const result = await archiveAdminExercise(EXERCISE_ID);

    expect(result).toEqual({
      data: { id: EXERCISE_ID, status: 'ARCHIVED' },
      error: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [input, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(input)).toBe(
      `${INTERNAL_ORIGIN}/api/v1/admin/exercises/${EXERCISE_ID}/archive`,
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
      }),
    );

    const headers = new Headers(init?.headers);
    expect(headers.get('Cookie')).toBe('corgly_token=jwt-de-teste');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
