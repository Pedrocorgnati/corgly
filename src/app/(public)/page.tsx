import type { Metadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { ProfessorSection } from '@/components/landing/professor-section';
import { MethodSection } from '@/components/landing/method-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { ContentPreviewSection } from '@/components/landing/content-preview-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { FAQSection } from '@/components/landing/faq-section';
import { CTASection } from '@/components/landing/cta-section';

export const metadata: Metadata = {
  title: 'Corgly — Aprenda Português com Professor Nativo',
  description: 'Aulas 1:1 ao vivo de português brasileiro com Pedro. Evolução mensurável com o Corgly Method.',
};

export default function LandingPage() {
  return (
    <div className="page-enter">
      <HeroSection />
      <ProfessorSection />
      <MethodSection />
      <PricingSection />
      <ContentPreviewSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
