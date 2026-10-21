// Fixture ficticia usada somente no ambiente e2e (item 010). Produto de teste,
// sem valor comercial: entra no registro apenas com EBOOKS_E2E_FIXTURE=1 e fora
// de producao, nunca no build ou no boot de producao.
import type { EbookCatalogInput } from '../../../src/lib/ebooks/schema';

import cover from './sales/cover.webp';

export const e2eEbookFixtureInput: EbookCatalogInput = {
  slug: 'e2e-fixture-ebook',
  title: 'E2E fixture ebook',
  audience: 'Automated end-to-end checks running on a fictional test product',
  locale: 'en',
  unitAmount: 1990,
  currency: 'usd',
  stripePriceEnv: {
    test: 'STRIPE_PRICE_EBOOK_E2E_TEST',
    live: 'STRIPE_PRICE_EBOOK_E2E_LIVE',
  },
  pdfFile: 'e2e-fixture-ebook.pdf',
  images: {
    cover: {
      // Mapeamento estrito: nunca espalhar o StaticImageData (blur* reprovaria).
      src: cover.src,
      width: cover.width,
      height: cover.height,
      alt: 'Fictional test cover of the E2E fixture ebook',
    },
  },
  copy: {
    title: 'E2E fixture ebook (fictional test product)',
    promise: 'A fictional test product used only to exercise the ebook flow end to end.',
    summary: [
      'Fictional sample chapter about the checkout flow.',
      'Fictional sample chapter about the access link flow.',
      'Fictional sample chapter about the refund flow.',
    ],
    faq: [
      {
        question: 'Is this a real product?',
        answer: 'No. This is a fictional test product used only by automated end-to-end checks.',
      },
      {
        question: 'Can a real order be placed for this ebook?',
        answer: 'No. The E2E fixture ebook is sold only in Stripe test mode.',
      },
    ],
    seo: {
      title: 'E2E fixture ebook (fictional test product)',
      description: 'Fictional test product used only to exercise the ebook flow end to end.',
    },
    emails: {
      deliverySubject: 'Your E2E fixture ebook is ready',
      deliveryBody: 'Fictional test product: your access link is ready.',
      recoverySubject: 'Resend of your E2E fixture ebook access link',
      recoveryBody: 'Fictional test product: here is the access link again.',
      accessLinkLabel: 'Open the access link',
      withdrawalLinkLabel: 'Ask for a refund',
      waiverNotice: 'Fictional test notice: the refund right ends once the download starts.',
      asyncFailedSubject: 'Payment for your E2E fixture ebook did not complete',
      asyncFailedBody: 'Fictional test product: the payment did not complete. Try the purchase again.',
      retryLinkLabel: 'Try the purchase again',
      refundFullSubject: 'Refund of your E2E fixture ebook',
      refundFullBody: 'Fictional test product: the full refund was processed.',
      refundPartialSubject: 'Partial refund of your E2E fixture ebook',
      refundPartialBody: 'Fictional test product: the partial refund was processed.',
    },
    withdrawal: {
      title: 'Ask for a refund of the E2E fixture ebook',
      body: 'Fictional test product: confirm below to request the refund of this purchase.',
      confirmLabel: 'Request the refund',
      acceptedBody: 'Fictional test product: the refund request was accepted.',
      reviewBody: 'Fictional test product: the refund request is under manual review.',
      expiredBody: 'Fictional test product: the refund window has already closed.',
      errorBody: 'Fictional test product: the refund request failed. Ask support to retry it.',
    },
    errors: {
      checkoutUnavailable: 'Fictional test checkout is unavailable right now.',
      checkoutFailed: 'Fictional test checkout failed. Try it again.',
      accessInvalid: 'This fictional test access link is invalid.',
      accessRevoked: 'This fictional test access was revoked.',
      pdfUnavailable: 'The fictional test PDF is unavailable right now.',
      accessRateLimited: 'Too many attempts on this fictional test access link.',
    },
  },
};
