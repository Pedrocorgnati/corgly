import type { EbookCatalogInput } from '@/lib/ebooks/schema';

// Ebook ficticio de regressao: exercita o mecanismo sem depender de nenhum
// ebook real. Importado somente por testes; nunca entra no registro de producao.
export const regressionEbookInput: EbookCatalogInput = {
  slug: 'regression-fixture-ebook',
  title: 'Ebook ficticio de regressao',
  audience: 'Publico ficticio de teste',
  locale: 'en',
  unitAmount: 1990,
  currency: 'usd',
  stripePriceEnv: {
    test: 'STRIPE_PRICE_EBOOK_REGRESSION_TEST',
    live: 'STRIPE_PRICE_EBOOK_REGRESSION_LIVE',
  },
  pdfFile: 'regression-fixture-ebook.pdf',
  images: {
    cover: {
      src: '/_test/cover.webp',
      width: 600,
      height: 900,
      alt: 'Capa ficticia de regressao',
    },
  },
  copy: {
    title: 'Titulo ficticio da pagina de venda',
    promise: 'Promessa ficticia do ebook de regressao',
    summary: ['Resumo ficticio do conteudo'],
    faq: [{ question: 'Pergunta ficticia?', answer: 'Resposta ficticia.' }],
    seo: {
      title: 'SEO ficticio',
      description: 'Descricao SEO ficticia',
    },
    emails: {
      deliverySubject: 'Assunto ficticio de entrega',
      deliveryBody: 'Corpo ficticio de entrega',
      recoverySubject: 'Assunto ficticio de recuperacao',
      recoveryBody: 'Corpo ficticio de recuperacao',
      accessLinkLabel: 'Rotulo ficticio do link de acesso',
      withdrawalLinkLabel: 'Rotulo ficticio do link de desistencia',
      waiverNotice: 'Aviso ficticio de renuncia',
      asyncFailedSubject: 'Assunto ficticio de falha assincrona',
      asyncFailedBody: 'Corpo ficticio de falha assincrona',
      retryLinkLabel: 'Rotulo ficticio do link de nova tentativa',
      refundFullSubject: 'Assunto ficticio de reembolso total',
      refundFullBody: 'Corpo ficticio de reembolso total',
      refundPartialSubject: 'Assunto ficticio de reembolso parcial',
      refundPartialBody: 'Corpo ficticio de reembolso parcial',
    },
    withdrawal: {
      title: 'Titulo ficticio da desistencia',
      body: 'Corpo ficticio da desistencia',
      confirmLabel: 'Rotulo ficticio de confirmacao',
      acceptedBody: 'Corpo ficticio de estorno solicitado',
      reviewBody: 'Corpo ficticio de analise manual',
      expiredBody: 'Corpo ficticio de prazo encerrado',
      errorBody: 'Corpo ficticio de falha no estorno',
    },
    errors: {
      checkoutUnavailable: 'Checkout ficticio indisponivel',
      checkoutFailed: 'Checkout ficticio falhou',
      accessInvalid: 'Acesso ficticio invalido',
      accessRevoked: 'Acesso ficticio revogado',
      pdfUnavailable: 'PDF ficticio indisponivel',
      accessRateLimited: 'Limite ficticio de acessos',
    },
  },
};

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type EbookInputOverrides = DeepPartial<EbookCatalogInput>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base: unknown, overrides: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

/**
 * Clona a fixture e aplica `overrides` por merge recursivo de objeto; array e
 * escalar substituem por inteiro. Serve para variantes VALIDAS.
 */
export function makeEbookInput(overrides: EbookInputOverrides = {}): EbookCatalogInput {
  const base = structuredClone(regressionEbookInput);
  return merge(base, structuredClone(overrides)) as EbookCatalogInput;
}
