import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AvatarInitials } from '@/components/ui/avatar-initials';

const CREDENTIALS = [
  'Experiência com alunos de 20+ países',
  'Criador do Corgly Method',
  'Disponível para aulas 1:1 ao vivo',
  'Feedback estruturado após cada aula',
];

export function ProfessorSection() {
  return (
    <section className="py-20 bg-background" aria-labelledby="professor-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <div className="flex justify-center">
            {/* @ASSET_PLACEHOLDER
            name: professor-pedro
            type: image
            extension: jpg
            format: 1:1
            dimensions: 400x400
            description: Pedro Corgnati, professor de português, sorrindo. Foto de perfil circular para seção "Conheça o Pedro" da landing page. Ambiente profissional e acolhedor.
            context: Seção professor da landing page
            style: Retrato profissional, iluminação natural, fundo neutro ou levemente desfocado
            mood: Confiável, acolhedor, profissional, amigável
            colors: Tons neutros e quentes, roupa em azul/indigo seria ótimo
            elements: Rosto sorridente, ombros visíveis, ambiente organizado ao fundo
            avoid: Expressão séria demais, fundo muito escuro, má iluminação
            */}
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-primary/20 shadow-lg">
              <AvatarInitials name="Pedro Corgnati" size="xl" className="w-full h-full text-4xl rounded-full" />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <Badge className="bg-accent text-accent-foreground hover:bg-accent">
              Professor Nativo
            </Badge>
            <h2 id="professor-heading" className="text-3xl md:text-4xl font-bold text-foreground">
              Conheça o Pedro
            </h2>
            <p className="text-lg text-muted-foreground font-medium">
              Professor nativo de português brasileiro com metodologia própria
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Sou Pedro Corgnati, professor nativo de português brasileiro com anos de experiência ensinando alunos internacionais de todos os níveis. Desenvolvi o Corgly Method para garantir evolução mensurável em cada ciclo de aulas.
            </p>
            <ul className="space-y-3" aria-label="Credenciais do professor">
              {CREDENTIALS.map((cred) => (
                <li key={cred} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#059669] flex-shrink-0" />
                  <span className="text-sm text-foreground">{cred}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
