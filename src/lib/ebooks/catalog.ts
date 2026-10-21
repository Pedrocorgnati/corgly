import 'server-only';

import { ebookRegistry } from '../../../content/ebooks/index';

import { EbookCatalogError } from './errors';
import { ebookCatalogEntrySchema, type EbookCatalogEntry } from './schema';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function slugOf(input: unknown): string | undefined {
  if (input !== null && typeof input === 'object' && 'slug' in input) {
    const slug = (input as { slug: unknown }).slug;
    if (typeof slug === 'string') return slug;
  }
  return undefined;
}

/**
 * Valida o catalogo inteiro e devolve as entradas congeladas.
 *
 * Pura: nao le disco nem env. A mensagem de erro usa so a primeira issue do
 * Zod (uma linha, deterministica) e nunca ecoa o valor recebido.
 */
export function parseEbookCatalog(input: readonly unknown[]): readonly EbookCatalogEntry[] {
  const entries: EbookCatalogEntry[] = [];

  input.forEach((raw, index) => {
    const result = ebookCatalogEntrySchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const slug = slugOf(raw);
      throw new EbookCatalogError(
        `ebook[${index}] (slug=${slug ?? '<sem slug>'}): ${issue.path.join('.')}: ${issue.message}`,
      );
    }
    entries.push(result.data);
  });

  const slugs = new Set<string>();
  const pdfFiles = new Set<string>();
  const envNames = new Set<string>();

  for (const entry of entries) {
    if (slugs.has(entry.slug)) {
      throw new EbookCatalogError(`ebook slug=${entry.slug}: slug duplicado no catalogo.`);
    }
    slugs.add(entry.slug);

    if (pdfFiles.has(entry.pdfFile)) {
      throw new EbookCatalogError(
        `ebook slug=${entry.slug}: pdfFile duplicado no catalogo (${entry.pdfFile}).`,
      );
    }
    pdfFiles.add(entry.pdfFile);

    for (const mode of ['test', 'live'] as const) {
      const envName = entry.stripePriceEnv[mode];
      if (envNames.has(envName)) {
        throw new EbookCatalogError(
          `ebook slug=${entry.slug}: stripePriceEnv.${mode} repete um nome de env ja usado no catalogo (${envName}).`,
        );
      }
      envNames.add(envName);
    }
  }

  return deepFreeze(entries);
}

// Validacao EAGER: qualquer consumidor quebra o `next build` e o boot quando o
// registro de conteudo esta invalido.
const EBOOK_CATALOG = parseEbookCatalog(ebookRegistry);

export function getEbookCatalog(): readonly EbookCatalogEntry[] {
  return EBOOK_CATALOG;
}

export function listEbooks(): readonly EbookCatalogEntry[] {
  return EBOOK_CATALOG;
}

export function getEbookBySlug(slug: string): EbookCatalogEntry | undefined {
  return EBOOK_CATALOG.find((entry) => entry.slug === slug);
}
