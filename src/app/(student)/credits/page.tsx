import type { Metadata } from 'next';
import { PricingCards } from '@/components/student/pricing-cards';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Comprar Créditos',
};

export default function CreditsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Comprar Créditos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o pacote ideal para você
        </p>
      </div>

      {/* First purchase discount banner */}
      <div className="mb-6 flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚡</span>
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
              Primeira aula 50% OFF — R$ 12,50
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">Apenas para novos alunos!</p>
          </div>
        </div>
        <button className="text-amber-500 hover:text-amber-700 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Fechar">
          ✕
        </button>
      </div>

      <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-2xl" />}>
        <PricingCards />
      </Suspense>
    </div>
  );
}
