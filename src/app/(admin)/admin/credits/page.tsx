import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Admin — Créditos',
};

// TODO: Implementar backend — GET /api/v1/admin/credits
const MOCK_TRANSACTIONS: Array<{
  id: string;
  studentName: string;
  type: string;
  amount: number;
  credits: number;
  date: string;
}> = [];

export default function AdminCreditsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Créditos e Pagamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico de transações da plataforma</p>
      </div>

      {MOCK_TRANSACTIONS.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma transação ainda"
          description="O histórico de compras de créditos aparecerá aqui."
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Aluno</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Tipo</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Créditos</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_TRANSACTIONS.map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{tx.studentName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[#059669] border-green-200 bg-green-50">
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">R$ {tx.amount}</td>
                    <td className="px-4 py-3 text-sm text-primary font-medium">+{tx.credits}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{tx.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
