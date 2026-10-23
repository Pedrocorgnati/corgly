import type { EbookCatalogInput } from '../../src/lib/ebooks/schema';

import { e2eEbookFixtureInput } from './_e2e-fixture/ebook';
import { portuguesBrasilenoParaHispanohablantesInput } from './portugues-brasileno-para-hispanohablantes/ebook';
import { portogheseBrasilianoPerItalofoniInput } from './portoghese-brasiliano-per-italofoni/ebook';

// Registro dos ebooks vendidos. Lancar ebook = nova pasta + uma linha aqui.
export const ebookRegistry: readonly EbookCatalogInput[] = [
  portuguesBrasilenoParaHispanohablantesInput,
  portogheseBrasilianoPerItalofoniInput,
  // Fixture ficticia so do ambiente e2e (item 010): entra apenas com
  // EBOOKS_E2E_FIXTURE=1 e fora de producao, nunca no build ou no boot de
  // producao. Ebooks reais futuros entram como linhas novas antes do spread.
  ...(process.env.EBOOKS_E2E_FIXTURE === '1' && process.env.NODE_ENV !== 'production'
    ? [e2eEbookFixtureInput]
    : []),
];
