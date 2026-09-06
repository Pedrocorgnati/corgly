'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_KEYS = [
  'duration',
  'cancel',
  'credits',
  'pack_vs_monthly',
  'beginner',
  'intensive',
  'business',
  'brazil_vs_pt',
  'first_lesson',
  'timezone',
  'platform',
  'payment',
] as const;

export function FAQSection() {
  const t = useTranslations('landing.faq');

  return (
    <section data-testid="landing-faq" className="py-[4.5rem] bg-white" id="faq" aria-labelledby="faq-heading">
      <div className="max-w-[760px] mx-auto px-5 md:px-6">
        <div className="text-center mb-9">
          <h2 id="faq-heading" className="text-[2.15rem] md:text-[2.6rem] font-bold tracking-tight text-[#1B2140]">
            {t('title')}
          </h2>
          <span className="mx-auto mt-3 block h-[3px] w-12 rounded-full bg-[#7c5cbf]" />
        </div>
        <Accordion data-testid="landing-faq-list" className="space-y-3" defaultValue={['item-0']}>
          {FAQ_KEYS.map((key, idx) => (
            <AccordionItem
              key={key}
              value={`item-${idx}`}
              data-testid={`landing-faq-item-${key.replace(/_/g, '-')}`}
              className="border border-border rounded-[10px] px-5 bg-white shadow-sm"
            >
              <AccordionTrigger
                data-testid={`landing-faq-item-${key.replace(/_/g, '-')}-trigger`}
                className="text-sm md:text-base font-semibold text-foreground hover:no-underline py-4 min-h-[52px] **:data-[slot=accordion-trigger-icon]:hidden"
              >
                {t(`items.${key}.q`)}
                <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7fb] text-primary">
                  <Plus className="h-4 w-4 group-aria-expanded/accordion-trigger:hidden" />
                  <Minus className="hidden h-4 w-4 group-aria-expanded/accordion-trigger:inline" />
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                {t(`items.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
