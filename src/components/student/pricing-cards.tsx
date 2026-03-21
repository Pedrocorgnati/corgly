'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PRICING } from '@/lib/constants';

const PACKAGES = [
  {
    id: 'SINGLE',
    credits: 1,
    name: 'Aula Avulsa',
    price: PRICING.SINGLE,
    priceLabel: 'por aula',
    features: ['1 aula individual', 'Válido por 6 meses', 'Sem compromisso'],
    popular: false,
  },
  {
    id: 'PACK_5',
    credits: 5,
    name: 'Pack 5 Aulas',
    price: PRICING.PACK_5,
    priceLabel: '(R$ 22/aula)',
    features: ['5 aulas individuais', 'Válido por 6 meses', 'Economia de 12%'],
    popular: false,
  },
  {
    id: 'PACK_10',
    credits: 10,
    name: 'Pack 10 Aulas',
    price: PRICING.PACK_10,
    priceLabel: '(R$ 19/aula)',
    features: ['10 aulas individuais', 'Válido por 6 meses', 'Economia de 24%', 'Prioridade no agendamento'],
    popular: true,
  },
  {
    id: 'MONTHLY',
    credits: 8,
    name: 'Plano Mensal',
    price: PRICING.MONTHLY,
    priceLabel: '/mês',
    features: ['8 aulas por mês', 'Renova mensalmente', 'Cancele quando quiser', 'Suporte prioritário'],
    popular: false,
  },
] as const;

export function PricingCards() {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = async (packageId: string) => {
    setLoadingId(packageId);
    try {
      // TODO: Implementar backend — POST /api/v1/checkout
      await new Promise((r) => setTimeout(r, 500));
      toast.error('Checkout não implementado — execute /auto-flow execute');
    } catch {
      toast.error('Erro ao processar pagamento. Tente novamente.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PACKAGES.map((pkg) => (
        <div
          key={pkg.id}
          className={cn(
            'bg-card border rounded-2xl p-6 flex flex-col relative',
            pkg.popular
              ? 'border-2 border-primary shadow-lg shadow-primary/10'
              : 'border-border shadow-sm',
          )}
        >
          {pkg.popular && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              Mais popular
            </Badge>
          )}

          <div className="mb-4">
            <p className="text-sm text-muted-foreground">{pkg.credits} crédito{pkg.credits > 1 ? 's' : ''}</p>
            <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
          </div>

          <div className="mb-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-foreground">R$ {pkg.price}</span>
            </div>
            <p className="text-sm text-muted-foreground">{pkg.priceLabel}</p>
          </div>

          <ul className="space-y-2 mb-6 flex-1">
            {pkg.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[#059669] flex-shrink-0 mt-0.5" />
                {feature}
              </li>
            ))}
          </ul>

          <Button
            onClick={() => handleBuy(pkg.id)}
            disabled={loadingId !== null}
            variant={pkg.popular ? 'default' : 'outline'}
            className={cn('w-full min-h-[48px]', !pkg.popular && 'border-primary text-primary hover:bg-primary/5')}
          >
            {loadingId === pkg.id ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processando...</>
            ) : (
              'Comprar'
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
