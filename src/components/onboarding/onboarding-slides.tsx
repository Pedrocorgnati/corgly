'use client';
import { UI_TIMING } from '@/lib/constants';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle,
  BookOpen,
  BarChart3,
  Calendar,
  Coins,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ──

interface OnboardingSlidesProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ── Constants ──

const TOTAL_SLIDES = 4;

const PILLAR_ICONS = [CheckCircle, BookOpen, BarChart3, Calendar, Coins];
const STEP_ICONS = [Calendar, BookOpen, BarChart3, CheckCircle];

// ── Component ──

export function OnboardingSlides({ onComplete, onSkip }: OnboardingSlidesProps) {
  const t = useTranslations('onboarding');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSkipping, setIsSkipping] = useState(false);

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, TOTAL_SLIDES - 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  const isFirst = currentSlide === 0;
  const isLast = currentSlide === TOTAL_SLIDES - 1;

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-lg">
        {/* Slide container */}
        <div
          aria-live="polite"
          className="min-h-[360px] flex flex-col items-center justify-center text-center transition-opacity duration-300"
          key={currentSlide}
        >
          {currentSlide === 0 && <SlideWelcome t={t} />}
          {currentSlide === 1 && <SlidePillars t={t} />}
          {currentSlide === 2 && <SlideCycle t={t} />}
          {currentSlide === 3 && <SlideCTA t={t} onComplete={onComplete} />}
        </div>

        {/* Progress dots */}
        <div
          role="tablist"
          aria-label={t('progress', { current: currentSlide + 1, total: TOTAL_SLIDES })}
          className="flex items-center justify-center gap-2 mt-8 mb-6"
        >
          {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === currentSlide}
              aria-label={t('progress', { current: i + 1, total: TOTAL_SLIDES })}
              tabIndex={i === currentSlide ? 0 : -1}
              onClick={() => setCurrentSlide(i)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                i === currentSlide
                  ? 'w-8 bg-primary'
                  : 'w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={isFirst}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('prev')}
          </Button>

          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('skip')}
          </Button>

          {!isLast && (
            <Button
              onClick={goNext}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('next')}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {isLast && (
            <Button
              variant="ghost"
              onClick={() => {
                setIsSkipping(true);
                // 300ms loading before completing (spec FE-007b)
                setTimeout(() => onComplete(), UI_TIMING.ONBOARDING_TRANSITION);
              }}
              disabled={isSkipping}
              className="text-muted-foreground hover:text-foreground"
            >
              {isSkipping ? '...' : 'Depois'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Slide Components ──

function SlideWelcome({ t }: { t: ReturnType<typeof useTranslations<'onboarding'>> }) {
  return (
    <>
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-6">
        <CheckCircle className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-3">
        {t('slide1.title')}
      </h1>
      <p className="text-muted-foreground text-base max-w-sm">
        {t('slide1.description')}
      </p>
    </>
  );
}

function SlidePillars({ t }: { t: ReturnType<typeof useTranslations<'onboarding'>> }) {
  const pillars: string[] = [
    t('slide2.pillars.0'),
    t('slide2.pillars.1'),
    t('slide2.pillars.2'),
    t('slide2.pillars.3'),
    t('slide2.pillars.4'),
  ];

  return (
    <>
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
        {t('slide2.title')}
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        {t('slide2.description')}
      </p>
      <ul className="space-y-3 w-full max-w-xs">
        {pillars.map((pillar, i) => {
          const Icon = PILLAR_ICONS[i];
          return (
            <li
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-left"
            >
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">{pillar}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SlideCycle({ t }: { t: ReturnType<typeof useTranslations<'onboarding'>> }) {
  const steps: string[] = [
    t('slide3.steps.0'),
    t('slide3.steps.1'),
    t('slide3.steps.2'),
    t('slide3.steps.3'),
  ];

  return (
    <>
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
        {t('slide3.title')}
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        {t('slide3.description')}
      </p>
      <ol className="space-y-3 w-full max-w-xs">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <li
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-left"
            >
              <div className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-foreground">{step}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function SlideCTA({
  t,
  onComplete,
}: {
  t: ReturnType<typeof useTranslations<'onboarding'>>;
  onComplete: () => void;
}) {
  return (
    <>
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-6">
        <Coins className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
        {t('slide4.title')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">
        {t('slide4.description')}
      </p>
      <div className="flex items-baseline gap-2 mb-6">
        <span className="text-3xl font-bold text-primary">{t('slide4.price')}</span>
        <span className="text-lg text-muted-foreground line-through">
          {t('slide4.original_price')}
        </span>
      </div>
      <Button
        onClick={onComplete}
        size="lg"
        className="w-full max-w-xs bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base font-semibold"
      >
        {t('slide4.cta')}
      </Button>
    </>
  );
}
