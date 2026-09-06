import { JsonLd } from '@/components/seo/JsonLd';
import { buildLandingPageSchemas } from '@/lib/seo/json-ld';
import { HeroSection } from '@/components/landing/hero-section';
import { GoalsAuthoritySection } from '@/components/landing/goals-authority-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { ProfessorSection } from '@/components/landing/professor-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { MethodSection } from '@/components/landing/method-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { FAQSection } from '@/components/landing/faq-section';
import { CTASection } from '@/components/landing/cta-section';

const schemas = buildLandingPageSchemas();

export const revalidate = 3600;

export default function LandingPage() {
  return (
    <div data-testid="page-landing" className="page-enter scroll-smooth">
      <JsonLd schemas={schemas} />
      <HeroSection />
      <GoalsAuthoritySection />
      <HowItWorksSection />
      <ProfessorSection />
      <TestimonialsSection />
      <MethodSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
