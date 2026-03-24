import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Suporte',
  description: 'Entre em contato com o suporte do Corgly.',
};

export default function SupportPage() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Link
          href={ROUTES.HOME}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-3">Suporte</h1>
        <p className="text-muted-foreground mb-10">
          Precisa de ajuda? Estamos aqui para você.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="mailto:suporte@corgly.app"
            className="flex items-start gap-4 rounded-2xl border border-border p-6 hover:bg-muted/50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Email</p>
              <p className="text-sm text-muted-foreground mt-1">
                suporte@corgly.app
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Respondemos em até 24 horas
              </p>
            </div>
          </a>

          <div className="flex items-start gap-4 rounded-2xl border border-border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Chat ao vivo</p>
              <p className="text-sm text-muted-foreground mt-1">
                Disponível em breve
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Seg–Sex, 9h–18h (BRT)
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-muted/30 p-6">
          <h2 className="font-semibold text-foreground mb-2">Perguntas frequentes</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Confira nossas respostas para as dúvidas mais comuns.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.HOME + '#faq'}>Ver FAQ</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
