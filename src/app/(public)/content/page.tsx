import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Lock, Play } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Conteúdo Gratuito',
  description: 'Aulas gratuitas de português brasileiro disponíveis em breve.',
};

export default function ContentPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
            Em breve
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Conteúdo Gratuito
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Estamos preparando aulas gratuitas para você praticar português brasileiro no seu próprio ritmo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            { level: 'A1 — Iniciante', lessons: 8, topic: 'Cumprimentos e apresentações' },
            { level: 'A2 — Básico', lessons: 10, topic: 'Cotidiano e rotina' },
            { level: 'B1 — Intermediário', lessons: 12, topic: 'Conversação e cultura' },
          ].map((module) => (
            <div
              key={module.level}
              className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-muted/30 flex items-center justify-center">
                <div className="text-center">
                  <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <span className="text-sm text-muted-foreground font-medium">Em breve</span>
                </div>
              </div>
              <div className="opacity-30">
                <BookOpen className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">{module.level}</h3>
                <p className="text-sm text-muted-foreground mb-2">{module.topic}</p>
                <p className="text-xs text-muted-foreground">{module.lessons} aulas</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 text-center">
          <Play className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            Enquanto isso, aprenda com um professor nativo
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Aulas ao vivo personalizadas para o seu nível e objetivos. Primeira aula com 50% de desconto.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={ROUTES.REGISTER} className={cn(buttonVariants())}>Criar conta grátis</Link>
            <Link href={ROUTES.HOME} className={cn(buttonVariants({ variant: 'outline' }))}>Ver como funciona</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
