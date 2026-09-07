// O visual desta pagina e CSS puro e vive num arquivo proprio, importado aqui.
// Nao ha nenhuma classe utilitaria do Tailwind daqui para baixo: a home ja
// renderizou sem estilo nenhum em producao quando o chunk unico de utilitarios
// nao chegou ao navegador, e ela e a primeira coisa que qualquer visitante ve.
// O porque completo esta no cabecalho de `landing.css`.
import './landing.css';

import { JsonLd } from '@/components/seo/JsonLd';
import { buildLandingPageSchemas } from '@/lib/seo/json-ld';
import { HeroSection } from '@/components/landing/hero-section';
import { GoalsAuthoritySection } from '@/components/landing/goals-authority-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { ProfessorSection } from '@/components/landing/professor-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { MethodSection } from '@/components/landing/method-section';
import { ContentPreviewSection } from '@/components/landing/content-preview-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { FAQSection } from '@/components/landing/faq-section';
import { CTASection } from '@/components/landing/cta-section';

const schemas = buildLandingPageSchemas();

export const revalidate = 3600;

export default function LandingPage() {
  return (
    <div data-testid="page-landing" className="lp">
      <JsonLd schemas={schemas} />
      <HeroSection />
      <GoalsAuthoritySection />
      <HowItWorksSection />
      <ProfessorSection />
      <TestimonialsSection />
      <MethodSection />
      {/* Conteudo gratuito antes do preco: o visitante ve o material publico
          (/content) antes de decidir comprar. */}
      <ContentPreviewSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
