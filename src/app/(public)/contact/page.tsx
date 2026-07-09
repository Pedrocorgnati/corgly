import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { LeadForm } from '@/components/public/LeadForm';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Fale com o Corgly. Tire dúvidas, peça uma demonstração ou conheça o método.',
};

export default function ContactPage() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="max-w-xl mx-auto px-4 py-16">
        <Link
          href={ROUTES.HOME}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </span>
          <h1 className="text-3xl font-bold text-foreground">Fale conosco</h1>
        </div>
        <p className="text-muted-foreground mb-10">
          Preencha o formulário e nossa equipe retornará em breve.
        </p>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LeadForm origin="CONTACT" submitLabel="Enviar mensagem" />
        </div>
      </div>
    </main>
  );
}
