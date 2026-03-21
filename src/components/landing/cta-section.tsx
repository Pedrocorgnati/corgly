import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export function CTASection() {
  return (
    <section
      className="py-20 bg-gradient-to-br from-[#312E81] via-[#4F46E5] to-[#6366F1]"
      aria-labelledby="cta-heading"
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 text-center">
        <h2 id="cta-heading" className="text-3xl md:text-4xl font-bold text-white mb-4">
          Pronto para aprender português de verdade?
        </h2>
        <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
          Primeira aula com 50% de desconto. Sem compromisso de longo prazo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={ROUTES.REGISTER}>
            <Button
              size="lg"
              className="w-full sm:w-auto bg-white text-[#4F46E5] hover:bg-white/90 font-semibold min-h-[52px] shadow-lg"
            >
              Criar Conta Agora
            </Button>
          </Link>
          <a href="#precos">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto border-white/50 text-white hover:bg-white/10 min-h-[52px]"
            >
              Ver Planos
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
