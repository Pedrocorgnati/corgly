// Montagem das URLs de retorno do Stripe Checkout para a pagina do ebook.
// O placeholder {CHECKOUT_SESSION_ID} vai literal (sem encodeURIComponent):
// a Stripe o substitui pelo ID real da sessao no redirect de sucesso.
// Funcao pura, sem server-only, para reuso tambem no client (item 009).

export function buildEbookCheckoutUrls(
  slug: string,
  appUrl: string,
): { successUrl: string; cancelUrl: string } {
  const base = appUrl.replace(/\/+$/, '');
  const encodedSlug = encodeURIComponent(slug);

  return {
    successUrl: `${base}/ebooks/${encodedSlug}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/ebooks/${encodedSlug}`,
  };
}
