// Content-Security-Policy das paginas, montada por requisicao no proxy.
//
// Por que nonce e nao `script-src 'self'` estatico: o Next emite scripts INLINE
// em toda pagina do App Router (payload RSC em `self.__next_f.push(...)` e o
// `$RC` que troca o fallback do `loading.tsx` pelo conteudo do stream). Com
// `script-src 'self'` o navegador bloqueava todos eles: a pagina ficava presa no
// "Carregando..." da raiz e nenhum botao hidratava (achado do item 026 do loop
// 10-19, A5). O Next le o nonce do header `content-security-policy` da
// REQUISICAO e o aplica aos proprios scripts; por isso o proxy repassa o header
// na requisicao e tambem o devolve na resposta.
//
// `'strict-dynamic'`: script carregado por um script com nonce herda a
// confianca (chunks do Next, Stripe.js), entao a lista de hosts nao precisa
// crescer a cada dependencia.
//
// Requisito: so pagina renderizada por requisicao recebe nonce. Pagina
// pre-renderizada no build sai com scripts sem nonce e seria bloqueada; hoje o
// layout raiz ja le cookies/headers (next-intl), entao todas as paginas sao
// dinamicas.

export const NONCE_HEADER = 'x-nonce';

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  // unsafe-eval so em dev: o HMR do Next avalia codigo em runtime.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' https://fonts.gstatic.com",
    // wss para Hocuspocus (module-7) + Stripe
    "connect-src 'self' wss://collab.corgly.app https://api.stripe.com",
    // YouTube para embeds (module-8) + Stripe
    "frame-src 'self' https://www.youtube.com https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
