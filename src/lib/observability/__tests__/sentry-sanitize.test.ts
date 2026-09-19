// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeSentrySpan,
  withSentrySanitizers,
} from '../sentry-sanitize';

describe('sanitizeSentryEvent', () => {
  it('substitui valores de chaves sensiveis em qualquer profundidade', () => {
    const event = {
      message: 'falha na troca do codigo',
      contexts: {
        response: {
          headers: {
            authorization: 'Bearer segredo-de-teste',
            'content-type': 'application/json',
          },
          data: {
            refresh_token: 'refresh-token-falso',
            access_token: 'access-token-falso',
            client_secret: 'client-secret-falso',
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
          },
        },
      },
      extra: {
        config: {
          api_key: 'key-falsa',
          encryptionKey: 'cifrado-em-repouso',
        },
      },
    };

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.contexts.response.headers.authorization).toBe('[Filtered]');
    expect(sanitized.contexts.response.headers['content-type']).toBe('application/json');
    expect(sanitized.contexts.response.data.refresh_token).toBe('[Filtered]');
    expect(sanitized.contexts.response.data.access_token).toBe('[Filtered]');
    expect(sanitized.contexts.response.data.client_secret).toBe('[Filtered]');
    // escopo nao e segredo: valor preservado
    expect(sanitized.contexts.response.data.scope).toBe(
      'https://www.googleapis.com/auth/calendar.readonly',
    );
    expect(sanitized.extra.config.api_key).toBe('[Filtered]');
    expect(sanitized.extra.config.encryptionKey).toBe('[Filtered]');
    expect(sanitized.message).toBe('falha na troca do codigo');
  });

  it('mascara valores com cara de segredo mesmo sem chave sensivel', () => {
    const event = {
      message:
        'resposta do google: sk-live-fake-1234567890abcdef ya29.sintetico-gap12-0000 um JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        request: {
        headers: { 'x-webhook-signature': 'whsec_assinatura000fake' },
      },
    };

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.message).not.toContain('sk-live-fake-1234567890abcdef');
    expect(sanitized.message).not.toContain('ya29.sintetico-gap12-0000');
    expect(sanitized.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(sanitized.message).toContain('[Filtered]');
    expect(sanitized.request.headers['x-webhook-signature']).toBe('[Filtered]');
  });

  it('varre arrays e preserva dados nao sensiveis', () => {
    const event = {
      breadcrumbs: [
        { message: 'pedido recebido' },
        { message: 'resposta com ya29.sintetico-gap12-0000', data: { code: 'abc' } },
      ],
      tags: { rota: '/api/v1/google/calendar/callback' },
      user: { id: 'admin-1' },
    };

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.breadcrumbs[0].message).toBe('pedido recebido');
    expect(sanitized.breadcrumbs[1].message).toContain('[Filtered]');
    expect(sanitized.breadcrumbs[1].data?.code).toBe('abc');
    expect(sanitized.tags.rota).toBe('/api/v1/google/calendar/callback');
    expect(sanitized.user.id).toBe('admin-1');
  });

  it('nao muta o evento original', () => {
    const event = { extra: { refresh_token: 'original' } };

    const sanitized = sanitizeSentryEvent(event);

    expect(event.extra.refresh_token).toBe('original');
    expect(sanitized.extra.refresh_token).toBe('[Filtered]');
  });
});

// GAP-12 ST001: casos S do sanitizador. So sentinelas sinteticas; os objetos
// imitam o formato de evento, breadcrumb e span sem importar o SDK do Sentry.
const REFRESH = 'refresh-token-sintetico-gap12-0000';
const CODE = 'auth-code-sintetico-gap12-0000';
const ACCESS = 'access-token-sintetico-gap12-0000';
const SECRET = 'client-secret-sintetico-gap12-0000';
const SENTINELAS = [REFRESH, CODE, ACCESS, SECRET];

const FILTRADO = '[Filtered]';
const DSN_SINTETICO = 'https://chave-sintetica@o0.ingest.invalid/0';
const URL_REVOKE = `https://oauth2.googleapis.com/revoke?token=${REFRESH}&x=1`;
const URL_REVOKE_FILTRADA = 'https://oauth2.googleapis.com/revoke?token=[Filtered]&x=1';

function caminho(valor: unknown, chaves: string[]): unknown {
  return chaves.reduce<unknown>(
    (atual, chave) =>
      atual !== null && typeof atual === 'object'
        ? (atual as Record<string, unknown>)[chave]
        : undefined,
    valor,
  );
}

function entradaS1() {
  return {
    comString: { request: { url: URL_REVOKE, query_string: `token=${REFRESH}&x=1` } },
    comPares: {
      request: {
        url: URL_REVOKE,
        query_string: [
          ['token', REFRESH],
          ['x', '1'],
        ],
      },
    },
    comObjeto: { request: { url: URL_REVOKE, query_string: { token: REFRESH, x: '1' } } },
    caixaMista: { request: { url: `https://corgly.invalid/cb#Access_Token=${ACCESS}&x=1` } },
  };
}

function entradaS2() {
  return {
    request: {
      headers: {
        Authorization: `Bearer ${ACCESS}`,
        COOKIE: `sessao=${REFRESH}`,
        'Set-Cookie': `sessao=${REFRESH}; Path=/; HttpOnly`,
        'Proxy-Authorization': `Basic ${SECRET}`,
        'X-Goog-Channel-Token': REFRESH,
        'Content-Type': 'application/json',
      },
    },
  };
}

function breadcrumbS3() {
  return {
    category: 'fetch',
    level: 'info',
    message: `troca concluida refresh_token=${REFRESH}`,
    data: {
      method: 'GET',
      status_code: 302,
      url: `https://corgly.invalid/api/v1/google/calendar/callback?code=${CODE}&state=abc`,
    },
  };
}

function entradaS4() {
  const ciclo: Record<string, unknown> = { nome: 'no-ciclico' };
  ciclo.eu = ciclo;
  let profundo: Record<string, unknown> = { folha: REFRESH };
  for (let nivel = 12; nivel >= 1; nivel -= 1) {
    profundo = { [`n${nivel}`]: profundo };
  }
  return {
    extra: {
      oauth: {
        refreshToken: REFRESH,
        accessToken: ACCESS,
        clientSecret: SECRET,
        refreshTokenEnc: `v1:${REFRESH}`,
        channelTokenEnc: `v1:${ACCESS}`,
        password: SECRET,
        expiresIn: 3599,
      },
      nota: `cabecalho enviado: Bearer ${ACCESS}`,
      ciclo,
    },
    contexts: { profundo, raso: { a: { b: 'visivel' } } },
  };
}

function entradaS5() {
  return {
    comString: { request: { method: 'POST', data: `token=${REFRESH}&foo=1` } },
    comObjeto: { request: { method: 'POST', data: { token: REFRESH, code: CODE, foo: '1' } } },
  };
}

function entradaS6() {
  return {
    exception: {
      values: [
        { type: 'Error', value: `invalid_grant: access_token=${ACCESS} expirado` },
        { type: 'SyntaxError', value: `resposta {"refresh_token":"${REFRESH}","expires_in":3599}` },
      ],
    },
  };
}

function spanS7() {
  return {
    span_id: 'span-sintetico-1',
    op: 'http.client',
    description: `POST https://oauth2.googleapis.com/revoke?token=${REFRESH}`,
    data: {
      'url.full': `https://oauth2.googleapis.com/revoke?token=${REFRESH}`,
      'http.url': `https://oauth2.googleapis.com/token?code=${CODE}&state=abc`,
      'http.query': `?token=${REFRESH}&x=1`,
      'url.query': `client_secret=${SECRET}&x=1`,
      'http.method': 'POST',
    },
  };
}

function eventoS7() {
  return {
    type: 'transaction',
    transaction: `GET /api/v1/google/calendar/callback?code=${CODE}&state=abc`,
    spans: [spanS7()],
  };
}

function compostoS8() {
  return withSentrySanitizers({
    dsn: DSN_SINTETICO,
    beforeSend: (event: Record<string, unknown>) => ({
      ...event,
      extra: { marca: 'existente', refresh_token: REFRESH },
    }),
    beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => ({
      ...breadcrumb,
      message: `apos existente access_token=${ACCESS}`,
    }),
  });
}

async function saidasS1aS8(): Promise<unknown[]> {
  const s1 = entradaS1();
  const s5 = entradaS5();
  const composto = compostoS8();
  return [
    sanitizeSentryEvent(s1.comString),
    sanitizeSentryEvent(s1.comPares),
    sanitizeSentryEvent(s1.comObjeto),
    sanitizeSentryEvent(s1.caixaMista),
    sanitizeSentryEvent(entradaS2()),
    sanitizeSentryEvent({ breadcrumbs: [breadcrumbS3()] }),
    sanitizeSentryBreadcrumb(breadcrumbS3()),
    sanitizeSentryEvent(entradaS4()),
    sanitizeSentryEvent(s5.comString),
    sanitizeSentryEvent(s5.comObjeto),
    sanitizeSentryEvent(entradaS6()),
    sanitizeSentryEvent(eventoS7()),
    sanitizeSentrySpan(spanS7()),
    await composto.beforeSend({ request: { url: URL_REVOKE } }, {}),
    await composto.beforeSendTransaction(eventoS7(), {}),
    composto.beforeBreadcrumb(breadcrumbS3()),
    composto.beforeSendSpan(spanS7()),
  ];
}

describe('GAP-12 ST001: casos S do sanitizador', () => {
  it('S1 filtra token em request.url e em query_string como string, pares e objeto, sem diferenciar maiusculas', () => {
    const { comString, comPares, comObjeto, caixaMista } = entradaS1();

    const doString = sanitizeSentryEvent(comString);
    expect(doString.request.url).toBe(URL_REVOKE_FILTRADA);
    expect(doString.request.query_string).toBe('token=[Filtered]&x=1');

    expect(sanitizeSentryEvent(comPares).request.query_string).toEqual([
      ['token', FILTRADO],
      ['x', '1'],
    ]);
    expect(sanitizeSentryEvent(comObjeto).request.query_string).toEqual({
      token: FILTRADO,
      x: '1',
    });
    expect(sanitizeSentryEvent(caixaMista).request.url).toBe(
      'https://corgly.invalid/cb#Access_Token=[Filtered]&x=1',
    );
  });

  it('S2 filtra headers sensiveis em caixa mista e preserva content-type', () => {
    const headers = sanitizeSentryEvent(entradaS2()).request.headers;

    expect(headers.Authorization).toBe(FILTRADO);
    expect(headers.COOKIE).toBe(FILTRADO);
    expect(headers['Set-Cookie']).toBe(FILTRADO);
    expect(headers['Proxy-Authorization']).toBe(FILTRADO);
    expect(headers['X-Goog-Channel-Token']).toBe(FILTRADO);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('S3 filtra code, state e refresh_token do breadcrumb no evento e em sanitizeSentryBreadcrumb, preservando categoria e nivel', () => {
    const urlFiltrada =
      'https://corgly.invalid/api/v1/google/calendar/callback?code=[Filtered]&state=[Filtered]';
    const doEvento = sanitizeSentryEvent({ breadcrumbs: [breadcrumbS3()] }).breadcrumbs[0];
    const entrada = breadcrumbS3();
    const avulso = sanitizeSentryBreadcrumb(entrada);

    for (const breadcrumb of [doEvento, avulso]) {
      expect(breadcrumb.data.url).toBe(urlFiltrada);
      expect(breadcrumb.message).toBe('troca concluida refresh_token=[Filtered]');
      expect(breadcrumb.category).toBe('fetch');
      expect(breadcrumb.level).toBe('info');
      expect(breadcrumb.data.method).toBe('GET');
      expect(breadcrumb.data.status_code).toBe(302);
    }
    expect(entrada).toEqual(breadcrumbS3());
  });

  it('S4 filtra chaves sensiveis aninhadas, Bearer em string livre, ciclo sem loop e nivel alem do limite', () => {
    const sanitized = sanitizeSentryEvent(entradaS4());
    const oauth = sanitized.extra.oauth;

    expect(oauth.refreshToken).toBe(FILTRADO);
    expect(oauth.accessToken).toBe(FILTRADO);
    expect(oauth.clientSecret).toBe(FILTRADO);
    expect(oauth.refreshTokenEnc).toBe(FILTRADO);
    expect(oauth.channelTokenEnc).toBe(FILTRADO);
    expect(oauth.password).toBe(FILTRADO);
    expect(oauth.expiresIn).toBe(3599);
    expect(sanitized.extra.nota).toBe('cabecalho enviado: Bearer [Filtered]');
    expect(sanitized.extra.ciclo.nome).toBe('no-ciclico');
    expect(sanitized.extra.ciclo.eu).toBe('[Circular]');

    const ate8 = ['contexts', 'profundo', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    expect(typeof caminho(sanitized, ate8)).toBe('object');
    expect(caminho(sanitized, [...ate8, 'n7'])).toBe(FILTRADO);
    expect(caminho(sanitized, ['contexts', 'raso', 'a', 'b'])).toBe('visivel');
  });

  it('S5 filtra token em request.data como form string e como objeto, preservando foo', () => {
    const { comString, comObjeto } = entradaS5();

    expect(sanitizeSentryEvent(comString).request.data).toBe('token=[Filtered]&foo=1');
    expect(sanitizeSentryEvent(comObjeto).request.data).toEqual({
      token: FILTRADO,
      code: FILTRADO,
      foo: '1',
    });
  });

  it('S6 filtra exception.values[].value em formato de parametro e de chave JSON', () => {
    const values = sanitizeSentryEvent(entradaS6()).exception.values;

    expect(values[0].value).toBe('invalid_grant: access_token=[Filtered] expirado');
    expect(values[0].type).toBe('Error');
    expect(values[1].value).toBe('resposta {"refresh_token":"[Filtered]","expires_in":3599}');
    expect(values[1].type).toBe('SyntaxError');
  });

  it('S7 filtra transaction, span.description e span.data e sanitizeSentrySpan nunca devolve null', () => {
    const transacao = sanitizeSentryEvent(eventoS7());
    const entrada = spanS7();
    const avulso = sanitizeSentrySpan(entrada);

    expect(transacao.transaction).toBe(
      'GET /api/v1/google/calendar/callback?code=[Filtered]&state=[Filtered]',
    );
    expect(transacao.type).toBe('transaction');
    for (const span of [transacao.spans[0], avulso]) {
      expect(span).not.toBeNull();
      expect(span.description).toBe('POST https://oauth2.googleapis.com/revoke?token=[Filtered]');
      expect(span.data['url.full']).toBe('https://oauth2.googleapis.com/revoke?token=[Filtered]');
      expect(span.data['http.url']).toBe(
        'https://oauth2.googleapis.com/token?code=[Filtered]&state=[Filtered]',
      );
      expect(span.data['http.query']).toBe('?token=[Filtered]&x=1');
      expect(span.data['url.query']).toBe('client_secret=[Filtered]&x=1');
      expect(span.data['http.method']).toBe('POST');
      expect(span.op).toBe('http.client');
      expect(span.span_id).toBe('span-sintetico-1');
    }
    expect(entrada).toEqual(spanS7());
    expect(sanitizeSentrySpan({ span_id: 'span-sem-dados' })).toEqual({ span_id: 'span-sem-dados' });
  });

  it('S8 withSentrySanitizers mantem os campos, roda o callback existente antes e o sanitizador por ultimo e preserva null', async () => {
    const beforeSend = vi.fn((event: Record<string, unknown>, _hint?: unknown) => ({
      ...event,
      extra: { marca: 'existente', refresh_token: REFRESH },
    }));
    const beforeBreadcrumb = vi.fn((breadcrumb: Record<string, unknown>) => ({
      ...breadcrumb,
      message: `apos existente access_token=${ACCESS}`,
    }));
    const beforeSendSpan = vi.fn((span: Record<string, unknown>) => ({
      ...span,
      description: `GET https://corgly.invalid/cb?code=${CODE}`,
    }));
    const opcoes = {
      dsn: DSN_SINTETICO,
      environment: 'teste',
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend,
      beforeBreadcrumb,
      beforeSendSpan,
    };

    const composto = withSentrySanitizers(opcoes);

    expect(composto.dsn).toBe(DSN_SINTETICO);
    expect(composto.environment).toBe('teste');
    expect(composto.tracesSampleRate).toBe(0.1);
    expect(composto.sendDefaultPii).toBe(false);
    expect(opcoes.beforeSend).toBe(beforeSend);

    const evento = { message: 'erro sintetico', request: { url: URL_REVOKE } };
    const hint = { originalException: new Error('erro sintetico') };
    const saida = await composto.beforeSend(evento, hint);
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend.mock.calls[0][0]).toBe(evento);
    expect(beforeSend.mock.calls[0][1]).toBe(hint);
    expect(saida).toEqual({
      message: 'erro sintetico',
      request: { url: URL_REVOKE_FILTRADA },
      extra: { marca: 'existente', refresh_token: FILTRADO },
    });

    const crumb = { category: 'fetch', level: 'info', message: 'ok' };
    expect(composto.beforeBreadcrumb(crumb)).toEqual({
      category: 'fetch',
      level: 'info',
      message: 'apos existente access_token=[Filtered]',
    });
    expect(beforeBreadcrumb.mock.calls[0][0]).toBe(crumb);

    const span = { span_id: 'span-sintetico-2', op: 'http.client' };
    expect(composto.beforeSendSpan(span)).toEqual({
      span_id: 'span-sintetico-2',
      op: 'http.client',
      description: 'GET https://corgly.invalid/cb?code=[Filtered]',
    });
    expect(beforeSendSpan.mock.calls[0][0]).toBe(span);

    const nulo = withSentrySanitizers({
      dsn: DSN_SINTETICO,
      beforeSend: () => null,
      beforeSendTransaction: async () => null,
      beforeBreadcrumb: () => null,
    });
    expect(await nulo.beforeSend({ message: 'descartado' }, {})).toBeNull();
    expect(await nulo.beforeSendTransaction({ type: 'transaction' }, {})).toBeNull();
    expect(nulo.beforeBreadcrumb({ message: 'descartado' })).toBeNull();

    const assincrono = withSentrySanitizers({
      dsn: DSN_SINTETICO,
      beforeSend: async (event: Record<string, unknown>) => ({ ...event, extra: { token: REFRESH } }),
    });
    expect(await assincrono.beforeSend({ message: 'assincrono' }, {})).toEqual({
      message: 'assincrono',
      extra: { token: FILTRADO },
    });

    const semExistente = withSentrySanitizers({ dsn: DSN_SINTETICO });
    expect(semExistente.dsn).toBe(DSN_SINTETICO);
    expect(await semExistente.beforeSend({ request: { url: URL_REVOKE } }, {})).toEqual({
      request: { url: URL_REVOKE_FILTRADA },
    });
    const transacao = await semExistente.beforeSendTransaction(eventoS7(), {});
    expect(transacao?.transaction).toBe(
      'GET /api/v1/google/calendar/callback?code=[Filtered]&state=[Filtered]',
    );
    expect(semExistente.beforeBreadcrumb(breadcrumbS3())?.message).toBe(
      'troca concluida refresh_token=[Filtered]',
    );
    expect(semExistente.beforeSendSpan(spanS7()).description).toBe(
      'POST https://oauth2.googleapis.com/revoke?token=[Filtered]',
    );
  });

  it('S9 controle: evento sem segredo sai igual em profundidade e a entrada nao muda', () => {
    const compartilhado = { rota: '/api/v1/google/calendar/callback' };
    const evento = {
      message: 'agenda sincronizada',
      level: 'info',
      tags: { modulo: 'agenda' },
      extra: {
        tentativa: 2,
        ok: true,
        vazio: null,
        lista: [1, 'dois', { tres: 3 }],
        erro: { code: 'P2002' },
        origem: compartilhado,
        destino: compartilhado,
      },
      request: {
        url: 'https://corgly.invalid/admin/google-calendar?aba=agenda',
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      },
      breadcrumbs: [
        { category: 'navigation', level: 'info', data: { from: '/admin', to: '/admin/google-calendar' } },
      ],
      exception: { values: [{ type: 'Error', value: 'falha de rede generica' }] },
    };
    const copia = structuredClone(evento);

    const saida = sanitizeSentryEvent(evento);

    expect(saida).toEqual(copia);
    expect(saida).not.toBe(evento);
    expect(evento).toEqual(copia);
  });

  it('ST004 preserva por referencia o sdkProcessingMetadata interno do SDK, que o envelope descarta', () => {
    class EscopoSintetico {
      nome = 'escopo-sintetico';
      obter() {
        return this.nome;
      }
    }
    const metadata = { capturedSpanScope: new EscopoSintetico(), spanCountBeforeProcessing: 3 };
    const evento = { message: 'evento com metadata do sdk', sdkProcessingMetadata: metadata };

    const saida = sanitizeSentryEvent(evento);

    expect(saida.sdkProcessingMetadata).toBe(metadata);
    expect(saida.sdkProcessingMetadata.capturedSpanScope.obter()).toBe('escopo-sintetico');
    expect(saida).not.toBe(evento);
  });

  it('S10 nenhuma saida de S1 a S8 carrega sentinela', async () => {
    const saidas = await saidasS1aS8();

    expect(saidas).toHaveLength(17);
    for (const saida of saidas) {
      const texto = JSON.stringify(saida);
      for (const sentinela of SENTINELAS) {
        expect(texto).not.toContain(sentinela);
      }
    }
  });
});
