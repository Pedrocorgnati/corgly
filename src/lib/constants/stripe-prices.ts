/**
 * Pacotes de CRÉDITO avulso (checkout `mode: 'payment'`).
 *
 * Escopo deliberado: só existe aqui o que é vendido como compra única. Os planos
 * de assinatura MONTHLY_10 / MONTHLY_20 NÃO entram nestes mapas — eles são
 * cobrados em `mode: 'subscription'`, precificados em `src/lib/pricing/config.ts`
 * e creditados por `resolveMonthlyCredits` a cada fatura paga. Entrada aqui
 * transformaria assinatura em compra avulsa.
 *
 * PACK_5 saiu da vitrine do dashboard, mas continua suportado para não quebrar
 * compras e lotes de crédito já existentes.
 */

/**
 * AQUI NÃO MORA PREÇO. Este arquivo guarda só crédito e rótulo.
 *
 * Existia aqui um `PACKAGE_PRICES` em centavos USD — uma TERCEIRA tabela de
 * preço, sem nenhum consumidor no código, ao lado de `PRICING`
 * (`src/lib/pricing/config.ts`, a única fonte multi-moeda do produto) e da
 * vitrine pública (`src/lib/constants/landing.ts`). Tabela órfã de preço não
 * fica desatualizada em silêncio: ela é adotada por engano meses depois e passa
 * a cobrar um valor que ninguém mais mantém. Preço se resolve por
 * `resolvePrice(pacote, moeda)`; a paridade com a landing é travada em
 * `src/lib/pricing/__tests__/pricing-parity.test.ts`.
 */

/** Quantidade de créditos por pacote. */
export const PACKAGE_CREDITS: Record<string, number> = {
  SINGLE: 1,
  PACK_5: 5,
  PACK_10: 10,
  PROMO: 1,
};

/** Nome amigável do pacote exibido no Stripe Checkout. */
export const PACKAGE_LABELS: Record<string, string> = {
  SINGLE: '1 Aula',
  PACK_5: '5 Aulas',
  PACK_10: '10 Aulas',
  PROMO: '1 Aula (50% OFF — Primeira Compra)',
};
