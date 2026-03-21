import Link from 'next/link';
import { CheckCircle2, Star, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

const PLANS = [
  {
    id: 'SINGLE',
    name: 'Avulsa',
    price: 25,
    pricePerLesson: 25,
    credits: 1,
    features: ['1 aula de 55 min', 'Feedback estruturado', 'Sala virtual com doc colaborativo', 'Suporte por email'],
    popular: false,
    cta: 'Começar agora',
    highlight: false,
  },
  {
    id: 'PACK_5',
    name: 'Pack 5',
    price: 110,
    pricePerLesson: 22,
    credits: 5,
    features: ['5 aulas de 55 min', 'Feedback estruturado', 'Sala virtual com doc colaborativo', 'Progresso e gráficos', 'Suporte prioritário'],
    popular: false,
    cta: 'Comprar Pack 5',
    highlight: false,
  },
  {
    id: 'PACK_10',
    name: 'Pack 10',
    price: 190,
    pricePerLesson: 19,
    credits: 10,
    features: ['10 aulas de 55 min', 'Feedback estruturado', 'Sala virtual com doc colaborativo', 'Progresso e gráficos', 'Histórico completo', 'Suporte prioritário', 'Acesso ao conteúdo P1'],
    popular: true,
    cta: 'Comprar Pack 10',
    highlight: true,
  },
  {
    id: 'MONTHLY',
    name: 'Mensal',
    price: 160,
    pricePerLesson: 20,
    credits: 8,
    features: ['8 aulas por mês', 'Feedback estruturado', 'Sala virtual com doc colaborativo', 'Progresso e gráficos', 'Renovação automática', 'Suporte prioritário'],
    popular: false,
    cta: 'Assinar Mensal',
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section className="py-20 bg-background" id="precos" aria-labelledby="pricing-heading">
      {/* Discount Banner */}
      <div className="bg-[#FEF3C7] dark:bg-[#78350F]/30 border-y border-[#F59E0B]/30 py-3 mb-12">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 flex items-center justify-center gap-2 flex-wrap">
          <AlertCircle className="h-4 w-4 text-[#D97706]" />
          <span className="text-sm font-medium text-[#D97706]">
            ★ Sua primeira aula tem 50% de desconto — apenas $12.50!
          </span>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">Planos</Badge>
          <h2 id="pricing-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Invista no seu português
          </h2>
          <p className="text-lg text-muted-foreground">
            Escolha o plano que melhor se adapta à sua rotina
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative border flex flex-col ${
                plan.highlight
                  ? 'border-2 border-primary shadow-lg'
                  : 'border-border'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    MAIS POPULAR
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-4 pt-8">
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">/ {plan.credits} aula{plan.credits > 1 ? 's' : ''}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${plan.pricePerLesson}/aula
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-6">
                <ul className="space-y-2 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#059669] flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link href={ROUTES.REGISTER}>
                  <Button
                    className={`w-full ${plan.highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                    variant={plan.highlight ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
