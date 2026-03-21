import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export function HeroSection() {
  return (
    <section
      className="relative min-h-[90vh] flex items-center bg-gradient-to-br from-[#312E81] via-[#4F46E5] to-[#6366F1] overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        {/* @ASSET_PLACEHOLDER
        name: bg-pattern
        type: image
        extension: svg
        format: tileable
        dimensions: 512x512
        description: Padrão de fundo sutil para seção hero. Formas geométricas abstras repetitivas em estilo minimalista.
        context: Seção hero da landing page, background
        style: Geométrico, minimalista, tile seamless
        mood: Profissional, moderno
        colors: Branco com 20% opacidade sobre indigo
        avoid: Realismo, muitos detalhes, não-tileable
        */}
        <div className="absolute inset-0 bg-[url('/images/bg-pattern.svg')] opacity-20" />
      </div>

      <div className="relative max-w-[1200px] mx-auto px-4 md:px-6 w-full py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 border border-white/30 px-4 py-2 backdrop-blur-sm">
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
              <span className="text-sm font-medium text-white">
                Primeira aula 50% OFF — apenas $12.50
              </span>
            </div>

            {/* Heading */}
            <h1
              id="hero-heading"
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight"
            >
              Aprenda português brasileiro com professor nativo
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-white/80 max-w-lg">
              Aulas 1:1 ao vivo com o Corgly Method. Evolução mensurável, acompanhamento real.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href={ROUTES.REGISTER} aria-label="Criar conta gratuita no Corgly">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-white text-[#4F46E5] hover:bg-white/90 font-semibold min-h-[52px] text-base shadow-lg"
                >
                  Criar Conta Grátis
                </Button>
              </Link>
              <a href="#precos" aria-label="Ver planos e preços do Corgly">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-white/50 text-white hover:bg-white/10 min-h-[52px] text-base"
                >
                  Ver Preços
                </Button>
              </a>
            </div>
          </div>

          {/* Professor image */}
          <div className="flex justify-center lg:justify-end">
            {/* @ASSET_PLACEHOLDER
            name: hero-professor
            type: image
            extension: jpg
            format: 3:4
            dimensions: 600x800
            description: Cena de aprendizado online acolhedora. Pedro Corgnati sorridente em videochamada no laptop. Ambiente de home office luminoso e organizado, com plantas e luz natural lateral.
            context: Hero section da landing page, imagem principal
            style: Fotografia lifestyle educacional, iluminação natural difusa, profundidade de campo média
            mood: Acolhedor, produtivo, motivador, acessível, humano
            colors: Predominância de branco, cinza claro, acentos de indigo na tela do laptop, tons quentes de madeira
            elements: Laptop aberto com videochamada visível, pessoa sorrindo, plantas, luz natural, caderno, caneca
            avoid: Logos visíveis, texto legível nas telas, salas escuras, tecnologia datada
            */}
            <div className="w-[300px] h-[400px] md:w-[360px] md:h-[480px] rounded-2xl overflow-hidden shadow-2xl bg-white/10 border border-white/20 flex items-center justify-center relative">
              <Image
                src="/images/hero-professor.png"
                alt="Pedro Corgnati, professor de português brasileiro, sorrindo em ambiente de home office"
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                Pedro Corgnati
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
