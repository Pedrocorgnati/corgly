import { z } from 'zod';

// Schema puro do catalogo de ebooks: sem `server-only`, sem I/O e sem
// `process.env`, porque o registro de conteudo e a fixture importam os tipos
// daqui e a validacao precisa rodar em qualquer ambiente.

const texto = z.string().trim().min(1);

/**
 * Slugs reservados: o segmento estatico /ebooks/acesso/ do link de acesso
 * sombrearia a pagina de venda de um ebook com esse slug.
 */
export const EBOOK_RESERVED_SLUGS = ['acesso'] as const;

export const ebookLocaleSchema = z.enum(['en', 'es', 'it']);
export type EbookLocale = z.infer<typeof ebookLocaleSchema>;

export const ebookImageSchema = z
  .object({
    src: texto, // espelha StaticImageData.src
    width: z.number().int().positive(), // espelha StaticImageData.width
    height: z.number().int().positive(), // espelha StaticImageData.height
    alt: texto,
  })
  .strict();

export const ebookFaqItemSchema = z
  .object({ question: texto, answer: texto })
  .strict();

export const ebookCopySchema = z
  .object({
    title: texto,
    promise: texto,
    summary: z.array(texto).min(1),
    faq: z.array(ebookFaqItemSchema).min(1),
    // Opcionais: nenhuma garantia nem aviso de IA e anunciado antes da decisao
    // do operador (defaults 5.2 e 5.8 do evidence/item-001.md).
    guarantee: texto.optional(),
    aiNotice: texto.optional(),
    seo: z.object({ title: texto, description: texto }).strict(),
    emails: z
      .object({
        deliverySubject: texto,
        deliveryBody: texto,
        recoverySubject: texto,
        recoveryBody: texto,
        accessLinkLabel: texto,
        withdrawalLinkLabel: texto,
        waiverNotice: texto,
        asyncFailedSubject: texto,
        asyncFailedBody: texto,
        retryLinkLabel: texto,
        refundFullSubject: texto,
        refundFullBody: texto,
        refundPartialSubject: texto,
        refundPartialBody: texto,
      })
      .strict(),
    // Textos da pagina de desistencia /ebooks/acesso/{token}/desistir.
    withdrawal: z
      .object({
        title: texto,
        body: texto,
        confirmLabel: texto,
        acceptedBody: texto,
        reviewBody: texto,
        expiredBody: texto,
        errorBody: texto,
      })
      .strict(),
    errors: z
      .object({
        checkoutUnavailable: texto,
        checkoutFailed: texto,
        accessInvalid: texto,
        accessRevoked: texto,
        pdfUnavailable: texto,
        accessRateLimited: texto,
      })
      .strict(),
  })
  .strict();
export type EbookCopy = z.infer<typeof ebookCopySchema>;

export const stripePriceEnvSchema = z
  .object({
    test: z.string().regex(/^[A-Z][A-Z0-9_]*$/), // NOME de variavel de ambiente, nunca o price ID
    live: z.string().regex(/^[A-Z][A-Z0-9_]*$/), // NOME de variavel de ambiente, nunca o price ID
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.test === value.live) {
      ctx.addIssue({
        code: 'custom',
        path: ['live'],
        message: 'stripePriceEnv.test e stripePriceEnv.live precisam ser nomes de env distintos.',
      });
    }
  });

export const ebookCatalogEntrySchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64)
      .refine((value) => !(EBOOK_RESERVED_SLUGS as readonly string[]).includes(value), {
        message: 'slug reservado: /ebooks/acesso/ e a rota do link de acesso',
      }),
    title: texto,
    audience: texto,
    locale: ebookLocaleSchema,
    unitAmount: z.number().int().positive(), // centavos; 1990 = US$ 19.90
    currency: z.enum(['usd']), // ampliar o enum = mudanca de mecanismo declarada
    stripePriceEnv: stripePriceEnvSchema,
    pdfFile: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/), // nome simples, relativo a EBOOKS_PRIVATE_DIR
    images: z
      .object({
        cover: ebookImageSchema,
        gallery: z.array(ebookImageSchema).optional(),
      })
      .strict(),
    copy: ebookCopySchema,
  })
  .strict();

export type EbookCatalogInput = z.input<typeof ebookCatalogEntrySchema>;
export type EbookCatalogEntry = z.infer<typeof ebookCatalogEntrySchema>;
