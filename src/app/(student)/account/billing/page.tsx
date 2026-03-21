import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, Receipt, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Pagamentos',
};

// STUB data — replaced by /back-end-build
const STUB_TRANSACTIONS: { id: string; date: string; description: string; amount: string; status: 'pago' }[] = [];

export default function BillingPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href={ROUTES.ACCOUNT}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Configurações
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pagamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico de compras e métodos de pagamento</p>
      </div>

      {/* Payment method card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Método de Pagamento
          </CardTitle>
          <CardDescription>Gerencie seus dados de cobrança</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="h-8 w-12 rounded bg-muted flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Cartão não cadastrado</p>
                <p className="text-xs text-muted-foreground">Adicione um cartão para comprar créditos</p>
              </div>
            </div>
            <Link href={ROUTES.CREDITS}>
              <Button variant="outline" size="sm">
                Adicionar
              </Button>
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
            Pagamentos processados com segurança via Stripe. Seus dados não são armazenados.
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Histórico de Compras
          </CardTitle>
          <CardDescription>Todas as suas transações de créditos</CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-0">
          {STUB_TRANSACTIONS.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">Nenhuma compra ainda</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Suas transações de créditos aparecerão aqui
              </p>
              <Link href={ROUTES.CREDITS}>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Comprar créditos
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {STUB_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{tx.amount}</p>
                    <span className="text-xs text-green-600 dark:text-green-400">{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
