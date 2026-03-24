'use client';

import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_KEYS = [
  'how_it_works',
  'duration',
  'cancel',
  'timezone',
  'credits_expire',
  'first_lesson',
] as const;

export function FAQSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-20 bg-surface" id="faq" aria-labelledby="faq-heading">
      <div className="max-w-[800px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 id="faq-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('faq.title')}
          </h2>
        </div>
        <Accordion className="space-y-2">
          {FAQ_KEYS.map((key, idx) => (
            <AccordionItem
              key={key}
              value={`item-${idx}`}
              className="border border-border rounded-xl px-4 bg-card"
            >
              <AccordionTrigger className="text-sm md:text-base font-medium text-foreground hover:no-underline py-4 min-h-[52px]">
                {t(`faq.items.${key}.q`)}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                {t(`faq.items.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
