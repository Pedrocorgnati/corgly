import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, BookOpen, Calendar, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Bem-vindo ao Corgly',
};

const steps = [
  {
    icon: CheckCircle,
    title: 'Conta criada!',
    description: 'Seu e-mail foi confirmado com sucesso.',
    done: true,
  },
  {
    icon: Coins,
    title: 'Compre seus créditos',
    description: 'Escolha um pacote de aulas que se encaixa no seu ritmo.',
    done: false,
  },
  {
    icon: Calendar,
    title: 'Agende sua primeira aula',
    description: 'Escolha um horário disponível no calendário do professor.',
    done: false,
  },
  {
    icon: BookOpen,
    title: 'Comece a aprender',
    description: 'Entre na sala virtual no horário marcado e aproveite!',
    done: false,
  },
];

export default function OnboardingPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[#C7D2FE] dark:bg-[#312E81] mb-4">
            <CheckCircle className="h-8 w-8 text-[#4F46E5] dark:text-[#818CF8]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
            Bem-vindo ao Corgly!
          </h1>
          <p className="text-muted-foreground text-base">
            Sua conta está pronta. Siga os próximos passos para começar sua jornada no português.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  step.done
                    ? 'bg-[#D1FAE5] dark:bg-[#064E3B]/30 border-[#059669]/30 dark:border-[#34D399]/20'
                    : 'bg-card border-border'
                }`}
              >
                <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${
                  step.done
                    ? 'bg-[#059669] dark:bg-[#34D399] text-white dark:text-[#064E3B]'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${step.done ? 'text-[#059669] dark:text-[#34D399]' : 'text-foreground'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                {index > 0 && (
                  <span className="ml-auto text-xs font-medium text-muted-foreground">
                    Passo {index + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <Link href={ROUTES.CREDITS} className="w-full">
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base font-semibold">
              Comprar créditos agora
            </Button>
          </Link>
          <Link href={ROUTES.DASHBOARD} className="w-full">
            <Button variant="ghost" className="w-full h-10 text-muted-foreground hover:text-foreground">
              Explorar o painel primeiro
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
