'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { fadeInUp } from '@/lib/animations';

export function HeroSection() {
  const t = useTranslations('landing');

  return (
    <section
      className="relative min-h-[90vh] flex items-center bg-brand-gradient overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[url('/images/bg-pattern.svg')] opacity-20" />
      </div>

      <div className="relative max-w-[1200px] mx-auto px-4 md:px-6 w-full py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <motion.div
            className="space-y-6"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 border border-white/30 px-4 py-2 backdrop-blur-sm">
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
              <span className="text-sm font-medium text-white">
                {t('hero.first_lesson_badge')}
              </span>
            </div>

            {/* Heading */}
            <h1
              id="hero-heading"
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight"
            >
              {t('hero.title')}
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-white/80 max-w-lg">
              {t('hero.subtitle')}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href={ROUTES.REGISTER} aria-label={t('hero.cta_primary_aria')}>
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-white text-primary hover:bg-white/90 font-semibold min-h-[52px] text-base shadow-lg"
                >
                  {t('hero.cta_primary')}
                </Button>
              </Link>
              <a href="#precos" aria-label={t('hero.cta_secondary_aria')}>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-white/50 text-white hover:bg-white/10 min-h-[52px] text-base"
                >
                  {t('hero.cta_secondary')}
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Professor image */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-[300px] h-[400px] md:w-[360px] md:h-[480px] rounded-2xl overflow-hidden shadow-2xl bg-white/10 border border-white/20 relative">
              <Image
                src="/images/hero-professor.png"
                alt={t('hero.professor_alt')}
                fill
                sizes="(max-width: 768px) 300px, 360px"
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
