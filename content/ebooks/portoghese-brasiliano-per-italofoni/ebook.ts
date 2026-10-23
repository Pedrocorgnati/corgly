// Ebook real de portugues brasileiro para falantes de italiano.
// Entrada do catalogo: uma linha nova no registro de content/ebooks.
import type { EbookCatalogInput } from '../../../src/lib/ebooks/schema';

import { portogheseBrasilianoPerItalofoniCopy } from './copy';
import cover from './sales/cover.webp';

export const portogheseBrasilianoPerItalofoniInput: EbookCatalogInput = {
  slug: 'portoghese-brasiliano-per-italofoni',
  title: 'Portoghese brasiliano per italofoni',
  audience:
    'Adulti italofoni falsi principianti, dal livello A1 al B1, che vogliono imparare il portoghese brasiliano con un percorso selettivo e spiegazioni contrastive',
  locale: 'it',
  unitAmount: 1990,
  currency: 'usd',
  stripePriceEnv: {
    test: 'STRIPE_PRICE_EBOOK_PORTOGHESE_BRASILIANO_PER_ITALOFONI_TEST',
    live: 'STRIPE_PRICE_EBOOK_PORTOGHESE_BRASILIANO_PER_ITALOFONI_LIVE',
  },
  pdfFile: 'portoghese-brasiliano-per-italofoni.pdf',
  images: {
    cover: {
      // Mapeamento estrito: nunca espalhar o StaticImageData (blur* reprovaria).
      src: cover.src,
      width: cover.width,
      height: cover.height,
      alt: 'Copertina di Portoghese brasiliano per italofoni: due adulti a un tavolino, con un quaderno aperto, in una strada brasiliana',
    },
  },
  copy: portogheseBrasilianoPerItalofoniCopy,
};
