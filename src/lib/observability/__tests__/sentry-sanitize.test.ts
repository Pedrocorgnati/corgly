// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { sanitizeSentryEvent } from '../sentry-sanitize';

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
        'resposta do google: sk-live-fake-1234567890abcdef ya29.fake-token-payload um JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        request: {
        headers: { 'x-webhook-signature': 'whsec_assinatura000fake' },
      },
    };

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.message).not.toContain('sk-live-fake-1234567890abcdef');
    expect(sanitized.message).not.toContain('ya29.fake-token-payload');
    expect(sanitized.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(sanitized.message).toContain('[Filtered]');
    expect(sanitized.request.headers['x-webhook-signature']).toBe('[Filtered]');
  });

  it('varre arrays e preserva dados nao sensiveis', () => {
    const event = {
      breadcrumbs: [
        { message: 'pedido recebido' },
        { message: 'resposta com ya29.token-falso-no-corpo', data: { code: 'abc' } },
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
