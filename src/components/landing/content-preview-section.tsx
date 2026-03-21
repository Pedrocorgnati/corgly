import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export function ContentPreviewSection() {
  return (
    <section className="py-20 bg-surface" aria-labelledby="content-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 text-center">
        <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">
          Conteúdo Gratuito
        </Badge>
        <h2 id="content-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          Em breve: aulas gratuitas
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Estamos preparando conteúdo gratuito de gramática, vocabulário e pronúncia.
          Cadastre-se para ser notificado quando lançar.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PlayCircle className="h-5 w-5 text-primary" />
          </div>
          <Link href={ROUTES.CONTENT}>
            <Button variant="outline">Ver todo o conteúdo</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
