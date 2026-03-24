'use client';

import { useState, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { Button } from '@/components/ui/button';

const TESTIMONIAL_KEYS = ['maria', 'giulia', 'james'] as const;
const RATINGS: Record<string, number> = { maria: 5, giulia: 5, james: 5 };

export function TestimonialsSection() {
  const t = useTranslations('landing');
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToIndex = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const child = container.children[index] as HTMLElement;
    if (child) {
      container.scrollTo({ left: child.offsetLeft - container.offsetLeft, behavior: 'smooth' });
    }
    setActiveIndex(index);
  };

  const goPrev = () => scrollToIndex(Math.max(activeIndex - 1, 0));
  const goNext = () => scrollToIndex(Math.min(activeIndex + 1, TESTIMONIAL_KEYS.length - 1));

  return (
    <section className="py-20 bg-background" aria-labelledby="testimonials-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 id="testimonials-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('testimonials.title')}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t('testimonials.subtitle')}
          </p>
        </div>

        {/* Empty state */}
        {TESTIMONIAL_KEYS.length === 0 ? (
          <p className="text-center text-muted-foreground">Em breve, depoimentos de alunos.</p>
        ) : (
          <>
            {/* Desktop: grid | Mobile: horizontal scroll with snap */}
            <div
              ref={scrollRef}
              className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scroll-smooth pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0"
            >
              {TESTIMONIAL_KEYS.map((key) => {
                const name = t(`testimonials.items.${key}.name`);
                const rating = RATINGS[key];

                return (
                  <Card
                    key={key}
                    className="border-border min-w-[280px] flex-shrink-0 md:min-w-0 md:flex-shrink snap-center"
                  >
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-0.5">
                        {Array.from({ length: rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 text-warning fill-warning" />
                        ))}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        &ldquo;{t(`testimonials.items.${key}.text`)}&rdquo;
                      </p>
                      <div className="flex items-center gap-3 pt-2 border-t border-border">
                        <AvatarInitials name={name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(`testimonials.items.${key}.country`)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Prev/next navigation — visible on all screen sizes */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={goPrev}
                disabled={activeIndex === 0}
                aria-label="Depoimento anterior"
                className="rounded-full"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {activeIndex + 1} / {TESTIMONIAL_KEYS.length}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={goNext}
                disabled={activeIndex === TESTIMONIAL_KEYS.length - 1}
                aria-label="Próximo depoimento"
                className="rounded-full"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
