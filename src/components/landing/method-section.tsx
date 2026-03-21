import { Target, Clock, BarChart3, BookOpen, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const PILLARS = [
  {
    icon: Target,
    title: 'Commitment',
    description: 'Metas claras a cada ciclo. Você sabe exatamente o que vai aprender e por que.',
  },
  {
    icon: Clock,
    title: 'Time-Boxed',
    description: 'Aulas de 55 minutos focadas. Sem dispersão, máximo aproveitamento do seu tempo.',
  },
  {
    icon: BarChart3,
    title: 'Measurable',
    description: 'Feedback em 4 dimensões após cada aula. Você vê sua evolução em números reais.',
  },
  {
    icon: BookOpen,
    title: 'Content-Driven',
    description: 'Conteúdo contextualizado no seu nível e objetivos. Aprende o que faz sentido para você.',
  },
  {
    icon: MessageCircle,
    title: 'Communicative',
    description: 'Foco em comunicação real desde a primeira aula. Sem gramática desconectada da prática.',
  },
];

export function MethodSection() {
  return (
    <section className="py-20 bg-surface" id="metodo" aria-labelledby="method-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">
            Metodologia
          </Badge>
          <h2 id="method-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            O Corgly Method
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Uma metodologia desenvolvida para garantir evolução real e mensurável no português brasileiro.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PILLARS.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border hover:shadow-md transition-shadow duration-[180ms]">
              <CardContent className="p-6 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
