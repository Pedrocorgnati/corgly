import { describe, expect, it } from 'vitest';

import { renderEbookEmail, type EbookEmailKind } from '@/lib/ebooks/email-render';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';
import { makeEbookInput, type EbookInputOverrides } from '../../fixtures/ebooks/regression-ebook';

const ACCESS_URL = 'https://app.exemplo.com/acesso/token-acesso';
const WITHDRAWAL_URL = 'https://app.exemplo.com/ebooks/exemplo/desistencia';
const RETRY_URL = 'https://app.exemplo.com/ebooks/exemplo';
const ALL_LINKS = {
  accessUrl: ACCESS_URL,
  withdrawalUrl: WITHDRAWAL_URL,
  retryUrl: RETRY_URL,
};

const EMAIL_FIELDS = [
  'deliverySubject',
  'deliveryBody',
  'recoverySubject',
  'recoveryBody',
  'accessLinkLabel',
  'withdrawalLinkLabel',
  'waiverNotice',
  'asyncFailedSubject',
  'asyncFailedBody',
  'retryLinkLabel',
  'refundFullSubject',
  'refundFullBody',
  'refundPartialSubject',
  'refundPartialBody',
] as const;
type EmailField = (typeof EMAIL_FIELDS)[number];

const FIELDS_BY_KIND: Record<EbookEmailKind, readonly EmailField[]> = {
  delivery: [
    'deliverySubject',
    'deliveryBody',
    'accessLinkLabel',
    'withdrawalLinkLabel',
    'waiverNotice',
  ],
  async_failed: ['asyncFailedSubject', 'asyncFailedBody', 'retryLinkLabel'],
  refund_full: ['refundFullSubject', 'refundFullBody'],
  refund_partial: ['refundPartialSubject', 'refundPartialBody'],
  recovery: [
    'recoverySubject',
    'recoveryBody',
    'accessLinkLabel',
    'withdrawalLinkLabel',
    'waiverNotice',
  ],
};

const KINDS: readonly EbookEmailKind[] = [
  'delivery',
  'async_failed',
  'refund_full',
  'refund_partial',
  'recovery',
];

const MARKER_EMAILS = {
  deliverySubject: 'CAMPO-deliverySubject',
  deliveryBody: 'CAMPO-deliveryBody',
  recoverySubject: 'CAMPO-recoverySubject',
  recoveryBody: 'CAMPO-recoveryBody',
  accessLinkLabel: 'CAMPO-accessLinkLabel',
  withdrawalLinkLabel: 'CAMPO-withdrawalLinkLabel',
  waiverNotice: 'CAMPO-waiverNotice',
  asyncFailedSubject: 'CAMPO-asyncFailedSubject',
  asyncFailedBody: 'CAMPO-asyncFailedBody',
  retryLinkLabel: 'CAMPO-retryLinkLabel',
  refundFullSubject: 'CAMPO-refundFullSubject',
  refundFullBody: 'CAMPO-refundFullBody',
  refundPartialSubject: 'CAMPO-refundPartialSubject',
  refundPartialBody: 'CAMPO-refundPartialBody',
};

function parseEntry(overrides: EbookInputOverrides = {}) {
  return ebookCatalogEntrySchema.parse(makeEbookInput(overrides));
}

describe('renderEbookEmail', () => {
  it('escapa titulo e corpo hostis sem criar elemento HTML', () => {
    const entry = parseEntry({
      title: '<script>alert(1)</script>',
      copy: {
        emails: {
          deliveryBody: 'a <img src=x onerror=alert(1)> "q" \'s\' & b',
        },
      },
    });

    const rendered = renderEbookEmail({
      entry,
      kind: 'delivery',
      links: { accessUrl: ACCESS_URL, withdrawalUrl: WITHDRAWAL_URL },
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('&lt;img');
    expect(rendered.html).toContain('&quot;');
    expect(rendered.html).toContain('&#39;');
    expect(rendered.html).toContain('&amp;');
    expect(rendered.text).toContain('<script>alert(1)</script>');
    expect(rendered.text).toContain('"q" \'s\' & b');
    expect(rendered.text).not.toContain('&lt;');
    expect(rendered.text).not.toContain('&amp;');
  });

  it('usa entry.locale como lang do html', () => {
    for (const locale of ['en', 'es', 'it'] as const) {
      const entry = parseEntry({ locale });

      const rendered = renderEbookEmail({ entry, kind: 'refund_full', links: {} });

      expect(rendered.html).toContain(`<html lang="${locale}">`);
      expect(rendered.html).toContain(`<html lang="${entry.locale}">`);
    }
  });

  it('cada kind usa somente os campos de email dele', () => {
    const entry = parseEntry({ copy: { emails: MARKER_EMAILS } });

    for (const kind of KINDS) {
      const rendered = renderEbookEmail({ entry, kind, links: ALL_LINKS });
      const esperados = FIELDS_BY_KIND[kind];

      for (const field of EMAIL_FIELDS) {
        const marker = `CAMPO-${field}`;
        const presente = esperados.includes(field);

        expect(rendered.html.includes(marker)).toBe(presente);
        expect(`${rendered.subject}\n${rendered.text}`.includes(marker)).toBe(presente);
      }
    }
  });

  it('delivery usa o corpo de entrega com botao de acesso, aviso e desistencia', () => {
    const entry = parseEntry({
      copy: {
        emails: {
          deliverySubject: 'Assunto de entrega',
          deliveryBody: 'Corpo de entrega',
          accessLinkLabel: 'Abrir meu acesso',
          withdrawalLinkLabel: 'Quero desistir',
          waiverNotice: 'Aviso de renuncia',
        },
      },
    });

    const rendered = renderEbookEmail({
      entry,
      kind: 'delivery',
      links: { accessUrl: ACCESS_URL, withdrawalUrl: WITHDRAWAL_URL },
    });

    expect(rendered.subject).toBe('Assunto de entrega');
    expect(rendered.html).toContain('Corpo de entrega');
    expect(rendered.html).toContain('Abrir meu acesso');
    expect(rendered.html).toContain(ACCESS_URL);
    expect(rendered.html).toContain('Aviso de renuncia');
    expect(rendered.html).toContain('Quero desistir');
    expect(rendered.html).toContain(WITHDRAWAL_URL);
    expect(rendered.text).toContain(`Abrir meu acesso: ${ACCESS_URL}`);
    expect(rendered.text).toContain(`Quero desistir: ${WITHDRAWAL_URL}`);
    expect(rendered.text).toContain('Aviso de renuncia');
  });

  it('recovery usa os campos de recuperacao com acesso, aviso e desistencia', () => {
    const entry = parseEntry({
      copy: {
        emails: {
          recoverySubject: 'Assunto de recuperacao',
          recoveryBody: 'Corpo de recuperacao',
          accessLinkLabel: 'Abrir meu acesso',
          withdrawalLinkLabel: 'Quero desistir',
          waiverNotice: 'Aviso de renuncia',
        },
      },
    });

    const rendered = renderEbookEmail({
      entry,
      kind: 'recovery',
      links: { accessUrl: ACCESS_URL, withdrawalUrl: WITHDRAWAL_URL },
    });

    expect(rendered.subject).toBe('Assunto de recuperacao');
    expect(rendered.html).toContain('Corpo de recuperacao');
    expect(rendered.html).toContain(ACCESS_URL);
    expect(rendered.html).toContain(WITHDRAWAL_URL);
    expect(rendered.html).toContain('Aviso de renuncia');
    expect(rendered.text).toContain(`Abrir meu acesso: ${ACCESS_URL}`);
    expect(rendered.text).toContain(`Quero desistir: ${WITHDRAWAL_URL}`);
    expect(rendered.text).toContain('Aviso de renuncia');
  });

  it('async_failed usa so os campos de falha assincrona com links.retryUrl', () => {
    const entry = parseEntry({
      copy: {
        emails: {
          asyncFailedSubject: 'Assunto de falha',
          asyncFailedBody: 'Corpo de falha',
          retryLinkLabel: 'Tentar de novo',
          accessLinkLabel: 'Abrir meu acesso',
          waiverNotice: 'Aviso de renuncia',
        },
      },
    });

    const rendered = renderEbookEmail({ entry, kind: 'async_failed', links: { retryUrl: RETRY_URL } });

    expect(rendered.subject).toBe('Assunto de falha');
    expect(rendered.html).toContain('Corpo de falha');
    expect(rendered.html).toContain('Tentar de novo');
    expect(rendered.html).toContain(RETRY_URL);
    expect(rendered.text).toContain(`Tentar de novo: ${RETRY_URL}`);
    expect(rendered.html).not.toContain('Abrir meu acesso');
    expect(rendered.html).not.toContain('Aviso de renuncia');
    expect(rendered.html).not.toContain(ACCESS_URL);
  });

  it('refund_full e refund_partial nao renderizam link nem aviso e ignoram links extras', () => {
    const entry = parseEntry();
    const linksComExtras = {
      accessUrl: 'javascript:alert(1)',
      withdrawalUrl: WITHDRAWAL_URL,
      retryUrl: RETRY_URL,
    };

    for (const kind of ['refund_full', 'refund_partial'] as const) {
      const rendered = renderEbookEmail({ entry, kind, links: linksComExtras });

      expect(rendered.html).not.toContain('<a ');
      expect(rendered.html).not.toContain('href=');
      expect(rendered.text).not.toContain('https://');
      expect(rendered.text).not.toContain('javascript');
      expect(rendered.html).not.toContain(entry.copy.emails.waiverNotice);
    }
  });

  it('traz a marca Corgly e o titulo do ebook no cabecalho de todo kind', () => {
    const entry = parseEntry({ title: 'Titulo do ebook' });

    for (const kind of KINDS) {
      const rendered = renderEbookEmail({ entry, kind, links: ALL_LINKS });

      expect(rendered.html).toContain('Corgly');
      expect(rendered.html).toContain('Titulo do ebook');
      expect(rendered.text).toContain('Corgly');
      expect(rendered.text).toContain('Titulo do ebook');
    }
  });

  it('lanca TypeError quando falta link obrigatorio por kind', () => {
    const entry = parseEntry();

    expect(() =>
      renderEbookEmail({ entry, kind: 'delivery', links: { withdrawalUrl: WITHDRAWAL_URL } }),
    ).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({ entry, kind: 'delivery', links: { accessUrl: ACCESS_URL } }),
    ).toThrow(TypeError);
    expect(() => renderEbookEmail({ entry, kind: 'async_failed', links: {} })).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({ entry, kind: 'recovery', links: { accessUrl: ACCESS_URL } }),
    ).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({ entry, kind: 'recovery', links: { withdrawalUrl: WITHDRAWAL_URL } }),
    ).toThrow(TypeError);
  });

  it('mensagem de erro aponta o link e o kind', () => {
    const entry = parseEntry();

    expect(() => renderEbookEmail({ entry, kind: 'delivery', links: {} })).toThrow(
      'renderEbookEmail: links.accessUrl obrigatorio para kind delivery',
    );
    expect(() =>
      renderEbookEmail({
        entry,
        kind: 'async_failed',
        links: { accessUrl: ACCESS_URL, withdrawalUrl: WITHDRAWAL_URL },
      }),
    ).toThrow('renderEbookEmail: links.retryUrl obrigatorio para kind async_failed');
    expect(() =>
      renderEbookEmail({ entry, kind: 'recovery', links: { accessUrl: ACCESS_URL } }),
    ).toThrow('renderEbookEmail: links.withdrawalUrl obrigatorio para kind recovery');
  });

  it('lanca TypeError para link vazio ou so espacos', () => {
    const entry = parseEntry();

    expect(() =>
      renderEbookEmail({
        entry,
        kind: 'delivery',
        links: { accessUrl: '   ', withdrawalUrl: WITHDRAWAL_URL },
      }),
    ).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({ entry, kind: 'async_failed', links: { retryUrl: '' } }),
    ).toThrow(TypeError);
  });

  it('lanca TypeError para url fora de http(s)', () => {
    const entry = parseEntry();

    expect(() =>
      renderEbookEmail({
        entry,
        kind: 'delivery',
        links: { accessUrl: 'javascript:alert(1)', withdrawalUrl: WITHDRAWAL_URL },
      }),
    ).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({ entry, kind: 'async_failed', links: { retryUrl: 'javascript:alert(1)' } }),
    ).toThrow(TypeError);
    expect(() =>
      renderEbookEmail({
        entry,
        kind: 'recovery',
        links: { accessUrl: ACCESS_URL, withdrawalUrl: '/ebooks/exemplo/desistencia' },
      }),
    ).toThrow(TypeError);
  });

  it('subject sai sem escape e o title do html sai escapado', () => {
    const entry = parseEntry({
      copy: { emails: { refundPartialSubject: 'Assunto "x" & <b>' } },
    });

    const rendered = renderEbookEmail({ entry, kind: 'refund_partial', links: {} });

    expect(rendered.subject).toBe('Assunto "x" & <b>');
    expect(rendered.html).toContain('<title>Assunto &quot;x&quot; &amp; &lt;b&gt;</title>');
    expect(rendered.html).not.toContain('<b>');
  });

  it('divide o corpo em paragrafos por linha em branco e usa br em quebra simples', () => {
    const entry = parseEntry({
      copy: {
        emails: {
          refundFullBody: 'Primeiro paragrafo.\n\nSegundo paragrafo.',
          refundPartialBody: 'linha um\nlinha dois',
        },
      },
    });

    const completo = renderEbookEmail({ entry, kind: 'refund_full', links: {} });
    expect(completo.html).toContain('Primeiro paragrafo.');
    expect(completo.html).toContain('Segundo paragrafo.');
    expect(completo.text).toContain('Primeiro paragrafo.\n\nSegundo paragrafo.');

    const parcial = renderEbookEmail({ entry, kind: 'refund_partial', links: {} });
    expect(parcial.html).toContain('linha um<br>linha dois');
    expect(parcial.text).toContain('linha um\nlinha dois');
  });

  it('gera html com tabela unica e metas e texto sem marca de html', () => {
    const entry = parseEntry();

    const rendered = renderEbookEmail({
      entry,
      kind: 'delivery',
      links: { accessUrl: ACCESS_URL, withdrawalUrl: WITHDRAWAL_URL },
    });

    expect(rendered.html).toContain('<!doctype html>');
    expect(rendered.html).toContain('<meta charset="utf-8">');
    expect(rendered.html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect((rendered.html.match(/<table/g) ?? []).length).toBe(1);
    expect(rendered.text).not.toContain('<');
  });
});
