import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQS = [
  {
    q: 'Como funcionam as aulas?',
    a: 'As aulas são individuais (1:1), ao vivo pela sala virtual do Corgly. Você e Pedro se conectam por vídeo, trabalham juntos em um documento colaborativo e ao final você recebe feedback estruturado em 4 dimensões.',
  },
  {
    q: 'Quanto tempo de antecedência preciso para agendar?',
    a: 'Você precisa agendar com pelo menos 24 horas de antecedência. O cancelamento também deve ser feito com 24h de antecedência para não perder o crédito.',
  },
  {
    q: 'Os créditos expiram?',
    a: 'Sim. Créditos avulsos expiram em 60 dias, packs em 90 dias e o plano mensal tem validade de 30 dias. Você recebe notificações antes de cada vencimento.',
  },
  {
    q: 'Posso reagendar minha aula?',
    a: 'Sim, desde que com pelo menos 24 horas de antecedência. Cancelamentos tardios consomem o crédito.',
  },
  {
    q: 'Qual o idioma das aulas?',
    a: 'As aulas são ministradas em português brasileiro com suporte em inglês quando necessário. O objetivo é maximizar a imersão no idioma.',
  },
  {
    q: 'O desconto de 50% se aplica a qual compra?',
    a: 'O desconto de 50% se aplica à primeira aula avulsa ($25 → $12.50). É automático para novos cadastros.',
  },
];

export function FAQSection() {
  return (
    <section className="py-20 bg-surface" id="faq" aria-labelledby="faq-heading">
      <div className="max-w-[800px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 id="faq-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Perguntas Frequentes
          </h2>
        </div>
        <Accordion className="space-y-2">
          {FAQS.map((faq, idx) => (
            <AccordionItem
              key={idx}
              value={`item-${idx}`}
              className="border border-border rounded-xl px-4 bg-card"
            >
              <AccordionTrigger className="text-sm md:text-base font-medium text-foreground hover:no-underline py-4 min-h-[52px]">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
