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

/** Preços dos pacotes de crédito em centavos USD (Stripe usa inteiros). */
export const PACKAGE_PRICES: Record<string, number> = {
  SINGLE: 2500,  // $25.00
  PACK_5: 11000, // $110.00 (5 × $22)
  PACK_10: 19000, // $190.00 (10 × $19)
  PROMO: 1250,   // $12.50 (50% OFF — isFirstPurchase + SINGLE)
};

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
