import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { BillingHistoryClient } from './billing-history-client';

export const metadata: Metadata = {
  title: 'Extrato Financeiro',
};

export default function BillingHistoryPage() {
  return (
    <PageWrapper data-testid="page-billing-history" className="max-w-5xl">
      <div data-testid="billing-history-header" className="mb-6 flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Extrato Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Seus pagamentos e recibos
          </p>
        </div>
      </div>

      <BillingHistoryClient />
    </PageWrapper>
  );
}
