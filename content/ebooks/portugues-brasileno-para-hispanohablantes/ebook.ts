// Ebook real de estrategia de portugues brasileiro para falantes de espanhol.
// Entrada do catalogo: uma linha nova no registro de content/ebooks.
import type { EbookCatalogInput } from '../../../src/lib/ebooks/schema';

import { portuguesBrasilenoParaHispanohablantesCopy } from './copy';
import cover from './sales/cover.webp';

export const portuguesBrasilenoParaHispanohablantesInput: EbookCatalogInput = {
  slug: 'portugues-brasileno-para-hispanohablantes',
  title: 'Portugués de Brasil para hispanohablantes: lo que ya sabes y lo que cambia',
  audience:
    'Adultos hispanohablantes falsos principiantes (A1-B1) que ya tuvieron algún contacto con el portugués de Brasil y necesitan saber qué aprovechar del español y qué entrenar de nuevo',
  locale: 'es',
  unitAmount: 1990,
  currency: 'usd',
  stripePriceEnv: {
    test: 'STRIPE_PRICE_EBOOK_PORTUGUES_BRASILENO_PARA_HISPANOHABLANTES_TEST',
    live: 'STRIPE_PRICE_EBOOK_PORTUGUES_BRASILENO_PARA_HISPANOHABLANTES_LIVE',
  },
  pdfFile: 'portugues-brasileno-para-hispanohablantes.pdf',
  images: {
    cover: {
      // Mapeamento estrito: nunca espalhar o StaticImageData (blur* reprovaria).
      src: cover.src,
      width: 800,
      height: 1200,
      alt: 'Portada: la palabra información cruza un puente y llega como informação. El título Portugués de Brasil para hispanohablantes está en la imagen.',
    },
  },
  copy: portuguesBrasilenoParaHispanohablantesCopy,
};
