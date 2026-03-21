import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AvatarInitials } from '@/components/ui/avatar-initials';

const TESTIMONIALS = [
  {
    name: 'Maria Chen',
    country: 'Estados Unidos',
    text: 'Em 3 meses com o Pedro, consegui me comunicar com a família do meu marido brasileiro pela primeira vez. O Corgly Method é incrível!',
    rating: 5,
  },
  {
    name: 'Giulia Rossi',
    country: 'Itália',
    text: 'As aulas 1:1 fizeram toda a diferença. O feedback estruturado após cada sessão me ajuda a focar no que realmente precisa melhorar.',
    rating: 5,
  },
  {
    name: 'James O\'Brien',
    country: 'Irlanda',
    text: 'Tentei vários apps de idiomas antes e nenhum funcionou como as aulas ao vivo com Pedro. Recomendo sem hesitar.',
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 bg-background" aria-labelledby="testimonials-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 id="testimonials-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            O que dizem os alunos
          </h2>
          <p className="text-lg text-muted-foreground">
            Resultados reais de alunos de todo o mundo
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} className="border-border">
              <CardContent className="p-6 space-y-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-[#F59E0B] fill-[#F59E0B]" />
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <AvatarInitials name={t.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.country}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
